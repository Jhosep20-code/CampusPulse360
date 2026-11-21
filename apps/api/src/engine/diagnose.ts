import { AiDiagnosis, AiProviderName, type AiOutputMeta, type Metric } from "@campuspulse/contracts";
import { getProvider } from "../ai/provider";
import {
  buildDiagnoseMessages,
  DIAGNOSE_PROMPT_ID,
  DIAGNOSE_PROMPT_VERSION,
  parseDiagnosis,
  retryMessage,
  type DiagnoseContext,
  type MetricSummary,
} from "../ai/prompts/diagnose.v1";
import { recordAiUsage, reserveAiCall } from "../ai/quota";
import type { AIProvider, AiMessage } from "../ai/types";
import { estimateTokens, limaTime } from "../ai/util";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import { FALLBACK_MODEL, FALLBACK_PROVIDER, rulesFallbackDiagnosis } from "./rules-fallback";

export interface DiagnoseOpts {
  force?: boolean;
  /** Reloj inyectable (pruebas, bot). Por defecto Date.now(). */
  now?: number;
  /** Inyeccion de proveedor (pruebas). undefined = getProvider(env); null = sin IA. */
  provider?: AIProvider | null;
}

const WINDOW_MS = 30 * 60_000;
const METRICS: Metric[] = ["co2_ppm", "temp_c", "rh_pct", "occupancy", "power_w"];

interface IncidentRow {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: string;
  opened_at: number;
  space_id: string;
  rule_id: string | null;
  ai_output_id: string | null;
  sname: string;
  stype: string;
  capacity: number;
  level: number;
  rname: string | null;
  rmetric: string | null;
  rop: string | null;
  rthreshold: number | null;
  rsustain: number | null;
  rseverity: "info" | "warning" | "critical" | null;
}

type AggRow = { n: number } & Record<string, number | null>;

/** Contexto del diagnostico: 1 consulta de incidencia + 1 batch de 4 consultas (todo agregado en SQL). */
async function buildContext(env: Env, inc: IncidentRow, now: number): Promise<DiagnoseContext> {
  const from = now - WINDOW_MS;
  const dev = "(SELECT id FROM devices WHERE space_id = ?1 AND active = 1 ORDER BY id LIMIT 1)";
  const aggCols = METRICS.map((m) => `MIN(${m}) AS ${m}_min, MAX(${m}) AS ${m}_max`).join(", ");
  const lastCols = METRICS.join(", ");
  const [devRes, aggRes, lastRes, histRes] = await env.DB.batch([
    env.DB.prepare(`SELECT ${dev} AS device_id`).bind(inc.space_id),
    env.DB.prepare(`SELECT COUNT(*) AS n, ${aggCols} FROM readings WHERE device_id = ${dev} AND ts > ?2 AND ts <= ?3`).bind(inc.space_id, from, now),
    env.DB.prepare(`SELECT ${lastCols} FROM readings WHERE device_id = ${dev} AND ts > ?2 AND ts <= ?3 ORDER BY ts DESC LIMIT 1`).bind(inc.space_id, from, now),
    env.DB.prepare(
      `SELECT opened_at, rule_id, severity, status FROM incidents WHERE space_id = ?1 AND id != ?2 ORDER BY opened_at DESC LIMIT 5`,
    ).bind(inc.space_id, inc.id),
  ]);
  const deviceId = (devRes?.results?.[0] as { device_id: string | null } | undefined)?.device_id ?? null;
  const agg = (aggRes?.results?.[0] ?? { n: 0 }) as AggRow;
  const last = (lastRes?.results?.[0] ?? null) as Record<string, number> | null;
  const summary: Partial<Record<Metric, MetricSummary>> = {};
  if (agg.n > 0 && last) {
    for (const m of METRICS) {
      const min = agg[`${m}_min`];
      const max = agg[`${m}_max`];
      const l = last[m];
      if (min !== null && min !== undefined && max !== null && max !== undefined && l !== undefined) {
        summary[m] = { min, max, last: l };
      }
    }
  }
  return {
    simulated: true,
    now_lima: limaTime(now),
    incident: { id: inc.id, title: inc.title, severity: inc.severity, opened_at: inc.opened_at },
    space: { id: inc.space_id, name: inc.sname, type: inc.stype, level: inc.level, capacity: inc.capacity },
    rule:
      inc.rule_id && inc.rname !== null
        ? {
            id: inc.rule_id,
            name: inc.rname,
            metric: inc.rmetric ?? "",
            op: inc.rop ?? ">=",
            threshold: inc.rthreshold ?? 0,
            sustain_s: inc.rsustain ?? 0,
            severity: inc.rseverity ?? inc.severity,
          }
        : null,
    device_id: deviceId,
    readings: { n: agg.n, window_min: WINDOW_MS / 60_000, summary },
    history: (histRes?.results ?? []) as DiagnoseContext["history"],
  };
}

async function loadIncident(env: Env, id: string): Promise<IncidentRow | null> {
  return env.DB.prepare(
    `SELECT i.id, i.title, i.severity, i.status, i.opened_at, i.space_id, i.rule_id, i.ai_output_id,
            s.name AS sname, s.type AS stype, s.capacity, f.level,
            r.name AS rname, r.metric AS rmetric, r.op AS rop, r.threshold AS rthreshold,
            r.sustain_s AS rsustain, r.severity AS rseverity
       FROM incidents i
       JOIN spaces s ON s.id = i.space_id
       JOIN floors f ON f.id = s.floor_id
       LEFT JOIN alert_rules r ON r.id = i.rule_id
      WHERE i.id = ?1`,
  )
    .bind(id)
    .first<IncidentRow>();
}

async function loadCached(env: Env, outputId: string): Promise<{ diagnosis: AiDiagnosis; meta: AiOutputMeta } | null> {
  const row = await env.DB.prepare(
    "SELECT provider, model, mode, latency_ms, created_at, output_json FROM ai_outputs WHERE id = ?1 AND valid_json = 1",
  )
    .bind(outputId)
    .first<{ provider: string; model: string; mode: "live" | "fallback"; latency_ms: number | null; created_at: number; output_json: string | null }>();
  if (!row?.output_json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.output_json);
  } catch {
    return null;
  }
  const d = AiDiagnosis.safeParse(parsed);
  if (!d.success) return null;
  const p = AiProviderName.safeParse(row.provider);
  return {
    diagnosis: d.data,
    meta: {
      provider: p.success ? p.data : FALLBACK_PROVIDER,
      model: row.model,
      // "cached" solo para inferencia real previa; un fallback guardado sigue siendo fallback.
      mode: row.mode === "live" ? "cached" : "fallback",
      created_at: row.created_at,
      latency_ms: row.latency_ms,
    },
  };
}

/**
 * Diagnostica una incidencia. Orden: cache -> IA en vivo (con 1 reintento si el
 * JSON es invalido) -> reglas deterministas. Siempre deja un ai_output, pasa la
 * incidencia de pending_ai a open y registra el evento 'diagnosed'.
 */
export async function diagnoseIncident(
  env: Env,
  incidentId: string,
  opts: DiagnoseOpts = {},
): Promise<{ diagnosis: AiDiagnosis; meta: AiOutputMeta }> {
  const now = opts.now ?? Date.now();
  const inc = await loadIncident(env, incidentId);
  if (!inc) throw new Error("incident_not_found");

  if (inc.ai_output_id && !opts.force) {
    const cached = await loadCached(env, inc.ai_output_id);
    if (cached) return cached;
  }

  const ctx = await buildContext(env, inc, now);
  const provider = opts.provider !== undefined ? opts.provider : getProvider(env);

  let diagnosis: AiDiagnosis | null = null;
  let inTok = 0;
  let outTok = 0;
  let latency = 0;
  let liveTried = false;
  let lastRaw = "";
  if (provider) {
    let messages: AiMessage[] = buildDiagnoseMessages(ctx);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await reserveAiCall(env, now))) break; // cupo diario agotado -> fallback
      liveTried = true;
      let c;
      try {
        c = await provider.complete(messages, { maxTokens: 900, json: true });
      } catch (e) {
        console.warn("diagnose: fallo del proveedor de IA", e instanceof Error ? e.message : "error");
        break;
      }
      const i = c.usage?.input_tokens ?? messages.reduce((n, m) => n + estimateTokens(m.content), 0);
      const o = c.usage?.output_tokens ?? estimateTokens(c.text);
      inTok += i;
      outTok += o;
      latency += c.latencyMs;
      await recordAiUsage(env, now, i, o);
      const parsed = parseDiagnosis(c.text);
      if (parsed.ok) {
        diagnosis = parsed.value;
        break;
      }
      lastRaw = c.text;
      messages = [...messages, { role: "assistant", content: c.text }, { role: "user", content: retryMessage(parsed.error) }];
    }
  }

  const live = diagnosis !== null && provider !== null;
  const finalDiag = diagnosis ?? rulesFallbackDiagnosis(ctx);
  const outId = newId("aio");
  const mode: "live" | "fallback" = live ? "live" : "fallback";
  const providerName = live && provider ? provider.name : FALLBACK_PROVIDER;
  const model = live && provider ? provider.model : FALLBACK_MODEL;

  const stmts: D1PreparedStatement[] = [];
  const insertOutput = env.DB.prepare(
    `INSERT INTO ai_outputs (id, incident_id, prompt_id, prompt_version, provider, model, mode, input_tokens, output_tokens, latency_ms, valid_json, output_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
  );
  if (!live && liveTried && provider) {
    // Traza del intento en vivo invalido (para medir la tasa de JSON valido).
    stmts.push(
      insertOutput.bind(
        newId("aio"), incidentId, DIAGNOSE_PROMPT_ID, DIAGNOSE_PROMPT_VERSION, provider.name, provider.model, "live",
        inTok, outTok, Math.round(latency), 0, JSON.stringify({ raw: lastRaw.slice(0, 2000) }), now,
      ),
    );
  }
  stmts.push(
    insertOutput.bind(
      outId, incidentId, DIAGNOSE_PROMPT_ID, DIAGNOSE_PROMPT_VERSION, providerName, model, mode,
      live ? inTok : null, live ? outTok : null, live ? Math.round(latency) : null, 1, JSON.stringify(finalDiag), now,
    ),
    env.DB.prepare(
      `UPDATE incidents SET ai_output_id = ?1, status = CASE WHEN status = 'pending_ai' THEN 'open' ELSE status END WHERE id = ?2`,
    ).bind(outId, incidentId),
    env.DB.prepare(
      `INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail) VALUES (?1, ?2, ?3, 'diagnosed', ?4, ?5)`,
    ).bind(newId("evt"), incidentId, now, live ? `ai:${providerName}` : FALLBACK_PROVIDER, `modo=${mode}; proveedor=${providerName}; modelo=${model}`),
  );
  await env.DB.batch(stmts);

  return {
    diagnosis: finalDiag,
    meta: {
      provider: live ? (providerName as AiOutputMeta["provider"]) : FALLBACK_PROVIDER,
      model,
      mode,
      created_at: now,
      latency_ms: live ? Math.round(latency) : null,
    },
  };
}
