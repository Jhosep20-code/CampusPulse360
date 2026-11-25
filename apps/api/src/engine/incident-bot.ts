import type { Env } from "../env";
import { newId } from "../lib/ids";
import { diagnoseIncident } from "./diagnose";
import { sendTelegram } from "./telegram";

export interface BotRunSummary {
  run_id: string;
  status: "success" | "partial" | "failed";
  summary: string;
}

interface RuleRow {
  id: string;
  name: string;
  metric: string;
  op: string;
  threshold: number;
  sustain_s: number;
  severity: string;
}

interface NewIncident {
  id: string;
  space_id: string;
  rule_id: string;
  title: string;
  severity: string;
}

/** Listas blancas: el nombre de columna y el operador se interpolan en SQL (vienen de la tabla alert_rules). */
const METRIC_EXPR: Record<string, string> = {
  co2_ppm: "r.co2_ppm",
  temp_c: "r.temp_c",
  rh_pct: "r.rh_pct",
  occupancy: "r.occupancy",
  power_w: "r.power_w",
  occupancy_ratio: "(r.occupancy * 1.0 / s.capacity)",
};
const SEV_RANK: Record<string, number> = { critical: 2, warning: 1, info: 0 };
const OPS = new Set([">", ">=", "<", "<="]);
const OPEN_SQL = "('pending_ai','open','acknowledged')";

/**
 * Una regla se cumple para un dispositivo si TODAS sus lecturas de los ultimos
 * max(sustain_s, 60) s cumplen la condicion, hay al menos 2 lecturas y la mas
 * antigua de la ventana tiene una antiguedad >= sustain_s - 60 s. Deteccion e
 * insercion ocurren en una sola sentencia SQL por regla (sin bucles en JS).
 */
function detectionStatement(env: Env, rule: RuleRow, now: number): D1PreparedStatement | null {
  const expr = METRIC_EXPR[rule.metric];
  if (!expr || !OPS.has(rule.op)) return null;
  const windowMs = Math.max(rule.sustain_s, 60) * 1000;
  const minAgeMs = (rule.sustain_s - 60) * 1000;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO incidents (id, space_id, rule_id, title, status, severity, opened_at, closed_at, dedup_key, ai_output_id)
     SELECT 'inc_' || lower(hex(randomblob(16))), g.space_id, ?1, ?2 || ' en ' || g.sname, 'pending_ai', ?3, ?4, NULL,
            g.space_id || ':' || ?1, NULL
       FROM (
         SELECT d.id AS device_id, d.space_id AS space_id, s.name AS sname,
                COUNT(*) AS n, MIN(r.ts) AS oldest,
                SUM(CASE WHEN ${expr} ${rule.op} ?5 THEN 1 ELSE 0 END) AS hits
           FROM readings r
           JOIN devices d ON d.id = r.device_id AND d.active = 1
           JOIN spaces s ON s.id = d.space_id
          WHERE r.ts >= ?6 AND r.ts <= ?4
          GROUP BY d.id
         HAVING n >= 2 AND hits = n AND (?4 - oldest) >= ?7
       ) g
      WHERE NOT EXISTS (
        SELECT 1 FROM incidents i WHERE i.dedup_key = g.space_id || ':' || ?1 AND i.status IN ${OPEN_SQL}
      )
        AND NOT EXISTS (
          SELECT 1 FROM incidents i2 JOIN alert_rules r2 ON r2.id = i2.rule_id
           WHERE i2.space_id = g.space_id AND i2.status IN ${OPEN_SQL} AND r2.metric = ?8
             AND (CASE r2.severity WHEN 'critical' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END) >= ?9
        )
     RETURNING id, space_id, rule_id, title, severity`,
  ).bind(rule.id, rule.name, rule.severity, now, rule.threshold, now - windowMs, minAgeMs, rule.metric, SEV_RANK[rule.severity] ?? 0);
}

/** Ventana sin la condicion para cerrar automaticamente una incidencia. */
export const AUTO_RESOLVE_MS = 10 * 60_000;

/**
 * Cierre automatico: una incidencia activa (open/acknowledged) se resuelve si su
 * regla NO se cumplio en ninguna lectura de los ultimos 10 min (al menos 3 lecturas)
 * y lleva abierta al menos ese tiempo. Devuelve 2 sentencias (evento + cierre).
 */
function autoResolveStatements(env: Env, rule: RuleRow, now: number): D1PreparedStatement[] {
  const expr = METRIC_EXPR[rule.metric];
  if (!expr || !OPS.has(rule.op)) return [];
  const candidates = `
    SELECT i.id FROM incidents i
     WHERE i.rule_id = ?1 AND i.status IN ('open','acknowledged') AND i.opened_at <= ?2 - ?3
       AND (SELECT COUNT(*) FROM readings r JOIN devices d ON d.id = r.device_id JOIN spaces s ON s.id = d.space_id
             WHERE d.space_id = i.space_id AND r.ts > ?2 - ?3 AND r.ts <= ?2) >= 3
       AND (SELECT COUNT(*) FROM readings r JOIN devices d ON d.id = r.device_id JOIN spaces s ON s.id = d.space_id
             WHERE d.space_id = i.space_id AND r.ts > ?2 - ?3 AND r.ts <= ?2 AND ${expr} ${rule.op} ?4) = 0`;
  return [
    env.DB.prepare(
      `INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail)
       SELECT 'evt_' || lower(hex(randomblob(16))), id, ?2, 'resolved', 'incident-bot',
              'Resuelta automaticamente: condicion normalizada durante 10 min (datos simulados)'
         FROM (${candidates})`,
    ).bind(rule.id, now, AUTO_RESOLVE_MS, rule.threshold),
    env.DB.prepare(`UPDATE incidents SET status = 'resolved', closed_at = ?2 WHERE id IN (${candidates})`).bind(
      rule.id,
      now,
      AUTO_RESOLVE_MS,
      rule.threshold,
    ),
  ];
}

/**
 * Bot de incidencias (cron cada minuto). Presupuesto de CPU: 1 lectura de reglas +
 * 1 batch de deteccion en SQL + a lo sumo 1 diagnostico (E/S) y 1 mensaje (E/S).
 */
export async function runIncidentBot(env: Env, now: number): Promise<BotRunSummary> {
  const runId = newId("run");
  const errors: string[] = [];
  const notes: string[] = [];
  let status: BotRunSummary["status"] = "success";

  await env.DB.prepare(
    "INSERT INTO bot_runs (id, bot, started_at, finished_at, status, summary, log) VALUES (?1, 'incident-bot', ?2, NULL, 'running', '', NULL)",
  )
    .bind(runId, now)
    .run();

  try {
    // Escenarios de demostracion vigentes: una lectura del perfil por tick y limpieza de vencidos (2 sentencias SQL).
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR REPLACE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source)
         SELECT device_id, ?1, co2_ppm, temp_c, rh_pct, occupancy, power_w, 'sim-scenario'
           FROM scenario_overrides WHERE until > ?1 AND mode = 'values'`,
      ).bind(now),
      env.DB.prepare("DELETE FROM scenario_overrides WHERE until <= ?1").bind(now),
    ]);
    const { results: rules } = await env.DB.prepare(
      "SELECT id, name, metric, op, threshold, sustain_s, severity FROM alert_rules WHERE enabled = 1",
    ).all<RuleRow>();
    // Reglas mas severas primero: una regla critica activa suprime la de menor severidad sobre la misma metrica y espacio.
    rules.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    const stmts = rules.map((r) => detectionStatement(env, r, now)).filter((s): s is D1PreparedStatement => s !== null);
    if (stmts.length < rules.length) errors.push("reglas con metrica u operador no soportado omitidas");

    let created: NewIncident[] = [];
    if (stmts.length > 0) {
      const res = await env.DB.batch(stmts);
      created = res.flatMap((r) => (r.results ?? []) as unknown as NewIncident[]);
    }
    if (created.length > 0) {
      await env.DB.batch(
        created.map((i) =>
          env.DB.prepare(
            "INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail) VALUES (?1, ?2, ?3, 'opened', 'incident-bot', ?4)",
          ).bind(newId("evt"), i.id, now, `${i.title} (regla ${i.rule_id}, ${i.severity})`),
        ),
      );
    }
    notes.push(`reglas=${rules.length}`, `nuevas=${created.length}`);

    // Cierre automatico de incidencias cuya condicion ya no se cumple (coherencia KPI/incidencias).
    const resolveStmts = rules.flatMap((r) => autoResolveStatements(env, r, now));
    if (resolveStmts.length > 0) {
      const rr = await env.DB.batch(resolveStmts);
      const closed = rr.filter((_, i) => i % 2 === 1).reduce((n, x) => n + (x.meta.changes ?? 0), 0);
      if (closed > 0) notes.push(`cerradas=${closed}`);
    }

    // Diagnostica como maximo 1 incidencia pendiente (la mas antigua); el resto en los siguientes ciclos.
    const pending = await env.DB.prepare(
      "SELECT i.id, i.severity, i.title, s.name AS sname FROM incidents i JOIN spaces s ON s.id = i.space_id WHERE i.status = 'pending_ai' ORDER BY i.opened_at ASC, i.id ASC LIMIT 1",
    ).first<{ id: string; severity: string; title: string; sname: string }>();
    if (pending) {
      try {
        const d = await diagnoseIncident(env, pending.id, { now });
        notes.push(`diagnosticada=${pending.id} (${d.meta.mode})`);
        const text =
          `CampusPulse 360 | ${d.diagnosis.severidad.toUpperCase()} | ${pending.sname}\n` +
          `${pending.title}\nCausa probable: ${d.diagnosis.causa_probable}\n` +
          `Datos simulados (prototipo).\n/incidentes/${pending.id}`;
        const tg = await sendTelegram(env, text);
        if (tg.sent) {
          await env.DB.prepare(
            "INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail) VALUES (?1, ?2, ?3, 'notified', 'incident-bot', 'Telegram')",
          )
            .bind(newId("evt"), pending.id, now)
            .run();
          notes.push("telegram=enviado");
        } else {
          notes.push(`telegram=${tg.reason ?? "no-enviado"}`);
        }
      } catch (e) {
        errors.push(`diagnostico/notificacion: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    if (errors.length > 0) status = "partial";
  } catch (e) {
    status = "failed";
    errors.push(e instanceof Error ? e.message : "error");
  }

  const summary = [...notes, ...errors.map((e) => `error: ${e}`)].join("; ") || "sin cambios";
  try {
    await env.DB.prepare("UPDATE bot_runs SET finished_at = ?1, status = ?2, summary = ?3, log = ?4 WHERE id = ?5")
      .bind(Math.max(now, Date.now()), status, summary.slice(0, 500), errors.length ? JSON.stringify(errors) : null, runId)
      .run();
  } catch {
    // Si ni siquiera se puede cerrar el registro no hay nada mas que hacer.
  }
  return { run_id: runId, status, summary };
}
