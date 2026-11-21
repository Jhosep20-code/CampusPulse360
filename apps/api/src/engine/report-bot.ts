import { getProvider } from "../ai/provider";
import {
  buildReportMessages,
  deterministicNarrative,
  parseReportNarrative,
  REPORT_PROMPT_ID,
  REPORT_PROMPT_VERSION,
  type ReportData,
  type ReportNarrative,
  type ReportSpaceRow,
} from "../ai/prompts/report.v1";
import { recordAiUsage, reserveAiCall } from "../ai/quota";
import type { AIProvider } from "../ai/types";
import { estimateTokens, round } from "../ai/util";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import type { BotRunSummary } from "./incident-bot";

const DAY = 86_400_000;
const BUCKET = 300_000;

interface SpaceAgg {
  space_id: string;
  name: string;
  level: number;
  capacity: number;
  n: number;
  co2_avg: number | null;
  co2_max: number | null;
  temp_avg: number | null;
  occ_max: number | null;
}

const r1 = (v: number | null, d = 1) => (v === null || v === undefined ? null : round(v, d));

/**
 * Bot de reportes diarios (cron 12:00 UTC). Todo el calculo pesado ocurre en SQL
 * (rollups a readings_5m y agregados por espacio); JS solo compone ~10 filas.
 * Los datos son SIMULADOS y el reporte lo marca con simulated:true.
 */
export async function runReportBot(
  env: Env,
  now: number,
  opts: { provider?: AIProvider | null } = {},
): Promise<BotRunSummary> {
  const runId = newId("run");
  const errors: string[] = [];
  let status: BotRunSummary["status"] = "success";
  let summary = "";

  await env.DB.prepare(
    "INSERT INTO bot_runs (id, bot, started_at, finished_at, status, summary, log) VALUES (?1, 'report-bot', ?2, NULL, 'running', '', NULL)",
  )
    .bind(runId, now)
    .run();

  try {
    const start = now - DAY;
    const bucketStart = Math.floor(start / BUCKET) * BUCKET;
    const [, spacesRes, incRes] = await env.DB.batch([
      env.DB.prepare(
        `INSERT OR REPLACE INTO readings_5m (device_id, bucket, co2_avg, co2_max, temp_avg, rh_avg, occ_avg, occ_max, power_avg, n)
         SELECT device_id, (ts / ${BUCKET}) * ${BUCKET} AS bucket, AVG(co2_ppm), MAX(co2_ppm), AVG(temp_c), AVG(rh_pct),
                AVG(occupancy), MAX(occupancy), AVG(power_w), COUNT(*)
           FROM readings WHERE ts >= ?1 AND ts <= ?2
          GROUP BY device_id, bucket`,
      ).bind(bucketStart, now),
      env.DB.prepare(
        `SELECT s.id AS space_id, s.name, f.level, s.capacity,
                COALESCE(SUM(m.n), 0) AS n,
                SUM(m.co2_avg * m.n) / SUM(m.n) AS co2_avg, MAX(m.co2_max) AS co2_max,
                SUM(m.temp_avg * m.n) / SUM(m.n) AS temp_avg, MAX(m.occ_max) AS occ_max
           FROM spaces s
           JOIN floors f ON f.id = s.floor_id
           LEFT JOIN devices d ON d.space_id = s.id
           LEFT JOIN readings_5m m ON m.device_id = d.id AND m.bucket >= ?1 AND m.bucket <= ?2
          GROUP BY s.id ORDER BY f.level, s.id`,
      ).bind(bucketStart, now),
      env.DB.prepare(
        `SELECT space_id, COUNT(*) AS c, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS crit
           FROM incidents WHERE opened_at >= ?1 AND opened_at <= ?2 GROUP BY space_id`,
      ).bind(start, now),
    ]);
    const inc = new Map<string, { c: number; crit: number }>();
    for (const r of (incRes?.results ?? []) as Array<{ space_id: string; c: number; crit: number }>) {
      inc.set(r.space_id, { c: r.c, crit: r.crit });
    }

    const rows: ReportSpaceRow[] = ((spacesRes?.results ?? []) as unknown as SpaceAgg[]).map((s) => {
      const i = inc.get(s.space_id);
      return {
        space_id: s.space_id,
        name: s.name,
        level: s.level,
        capacity: s.capacity,
        readings_n: s.n,
        co2_avg: r1(s.co2_avg, 0),
        co2_max: r1(s.co2_max, 0),
        temp_avg: r1(s.temp_avg, 1),
        occupancy_max: s.occ_max,
        occupancy_ratio_max: s.occ_max === null ? null : round(s.occ_max / s.capacity, 2),
        incidents: i?.c ?? 0,
        incidents_critical: i?.crit ?? 0,
      };
    });
    const withData = rows.filter((r) => r.readings_n > 0);
    const maxCo2 = withData.reduce<ReportSpaceRow | null>((m, r) => ((r.co2_max ?? -1) > (m?.co2_max ?? -1) ? r : m), null);
    const totalN = withData.reduce((n, r) => n + r.readings_n, 0);
    const weighted = (pick: (r: ReportSpaceRow) => number | null) =>
      totalN === 0 ? null : withData.reduce((s, r) => s + (pick(r) ?? 0) * r.readings_n, 0) / totalN;
    const data: ReportData = {
      simulated: true,
      period: { start, end: now },
      spaces: rows,
      totals: {
        spaces: rows.length,
        readings: totalN,
        incidents: rows.reduce((n, r) => n + r.incidents, 0),
        incidents_critical: rows.reduce((n, r) => n + r.incidents_critical, 0),
        co2_avg: r1(weighted((r) => r.co2_avg), 0),
        co2_max: maxCo2?.co2_max ?? null,
        co2_max_space: maxCo2?.name ?? null,
        temp_avg: r1(weighted((r) => r.temp_avg), 1),
      },
    };

    // Narrativa: IA si hay proveedor y cupo; si no, determinista y etiquetada.
    let narrative: ReportNarrative = deterministicNarrative(data);
    let nMode: "live" | "fallback" = "fallback";
    let nProvider = "rules-fallback";
    let nModel = "rules-v1";
    const provider = opts.provider !== undefined ? opts.provider : getProvider(env);
    if (provider && (await reserveAiCall(env, now))) {
      try {
        const msgs = buildReportMessages(data);
        const c = await provider.complete(msgs, { maxTokens: 700, json: true });
        const i = c.usage?.input_tokens ?? msgs.reduce((n, m) => n + estimateTokens(m.content), 0);
        const o = c.usage?.output_tokens ?? estimateTokens(c.text);
        await recordAiUsage(env, now, i, o);
        const p = parseReportNarrative(c.text);
        await env.DB.prepare(
          `INSERT INTO ai_outputs (id, incident_id, prompt_id, prompt_version, provider, model, mode, input_tokens, output_tokens, latency_ms, valid_json, output_json, created_at)
           VALUES (?1, NULL, ?2, ?3, ?4, ?5, 'live', ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
          .bind(newId("aio"), REPORT_PROMPT_ID, REPORT_PROMPT_VERSION, provider.name, provider.model, i, o, Math.round(c.latencyMs), p.ok ? 1 : 0, p.ok ? JSON.stringify(p.value) : JSON.stringify({ raw: c.text.slice(0, 2000) }), now)
          .run();
        if (p.ok) {
          narrative = p.value;
          nMode = "live";
          nProvider = provider.name;
          nModel = provider.model;
        } else {
          errors.push("narrativa IA invalida; se uso la determinista");
        }
      } catch (e) {
        errors.push(`narrativa IA: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    const content = {
      ...data,
      narrative: {
        text: narrative.narrativa,
        recomendaciones: narrative.recomendaciones,
        mode: nMode,
        provider: nProvider,
        model: nModel,
        label: nMode === "live" ? "Narrativa generada por IA sobre datos simulados" : "Narrativa determinista (sin IA) sobre datos simulados",
      },
    };
    const repId = newId("rep");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO reports (id, kind, period_start, period_end, created_at, content_json) VALUES (?1, 'daily', ?2, ?3, ?4, ?5)",
      ).bind(repId, start, now, now, JSON.stringify(content)),
      // Retencion (plan Free): las lecturas crudas viven 14 dias (los rollups de 5 min se conservan) y los bot_runs 7.
      env.DB.prepare("DELETE FROM readings WHERE ts < ?1").bind(now - 14 * DAY),
      env.DB.prepare("DELETE FROM bot_runs WHERE started_at < ?1").bind(now - 7 * DAY),
    ]);
    summary = `reporte=${repId}; espacios=${rows.length}; lecturas=${totalN}; incidencias=${data.totals.incidents}; narrativa=${nMode}`;
    if (errors.length) status = "partial";
  } catch (e) {
    status = "failed";
    errors.push(e instanceof Error ? e.message : "error");
  }

  const finalSummary = [summary, ...errors.map((e) => `error: ${e}`)].filter(Boolean).join("; ") || "sin cambios";
  try {
    await env.DB.prepare("UPDATE bot_runs SET finished_at = ?1, status = ?2, summary = ?3, log = ?4 WHERE id = ?5")
      .bind(Math.max(now, Date.now()), status, finalSummary.slice(0, 500), errors.length ? JSON.stringify(errors) : null, runId)
      .run();
  } catch {
    // sin accion posible
  }
  return { run_id: runId, status, summary: finalSummary };
}
