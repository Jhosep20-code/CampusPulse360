import type { ScenarioName } from "@campuspulse/contracts";
import type { Env } from "../env";

const MIN = 60_000;
const OPEN_SQL = "('pending_ai','open','acknowledged')";
/** Duracion durante la que el escenario mantiene su perfil (cron cada minuto). */
export const SCENARIO_HOLD_MS = 10 * MIN;

const CLEAR_SIM_WINDOW =
  "DELETE FROM readings WHERE device_id = ?1 AND ts >= ?2 AND ts <= ?3 AND source = 'sim'";
const UPSERT_OVERRIDE =
  `INSERT OR REPLACE INTO scenario_overrides (device_id, scenario, started_at, until, co2_ppm, temp_c, rh_pct, occupancy, power_w)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`;

const INSERT_READING =
  "INSERT OR REPLACE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sim-scenario')";

/**
 * Escenarios de demostracion (datos SIMULADOS, source 'sim-scenario'). Solo se
 * insertan timestamps <= now. Todo el trabajo es un batch de SQL, sin calculo en JS.
 */
export async function applyScenario(
  env: Env,
  name: ScenarioName,
  now: number,
  actor: string,
): Promise<{ inserted: number; resolved: number }> {
  if (name === "aula-saturada") {
    // DEV_3_A301 (capacidad 45): 6 lecturas, 1/min; CO2 1250 -> 1700, ocupacion 52, temperatura 26 -> 27.
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < 6; i++) {
      stmts.push(
        env.DB.prepare(INSERT_READING).bind("DEV_3_A301", now - (5 - i) * MIN, 1250 + i * 90, 26 + i * 0.2, 58, 52, 2100),
      );
    }
    // El escenario sustituye a las lecturas del simulador en su ventana y mantiene el perfil 10 min.
    stmts.unshift(env.DB.prepare(CLEAR_SIM_WINDOW).bind("DEV_3_A301", now - 6 * MIN, now));
    stmts.push(env.DB.prepare(UPSERT_OVERRIDE).bind("DEV_3_A301", name, now, now + SCENARIO_HOLD_MS, 1700, 27, 58, 52, 2100));
    stmts.push(env.DB.prepare("UPDATE devices SET last_seen = ?1 WHERE id = 'DEV_3_A301'").bind(now));
    await env.DB.batch(stmts);
    return { inserted: 6, resolved: 0 };
  }

  if (name === "falla-climatizacion") {
    // DEV_4_LAB2: temperatura 29,5 -> 31 durante los ultimos 5 min (6 lecturas, 1/min).
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < 6; i++) {
      stmts.push(
        env.DB.prepare(INSERT_READING).bind("DEV_4_LAB2", now - (5 - i) * MIN, 720, Math.round((29.5 + i * 0.3) * 10) / 10, 42, 18, 1500),
      );
    }
    stmts.unshift(env.DB.prepare(CLEAR_SIM_WINDOW).bind("DEV_4_LAB2", now - 6 * MIN, now));
    stmts.push(env.DB.prepare(UPSERT_OVERRIDE).bind("DEV_4_LAB2", name, now, now + SCENARIO_HOLD_MS, 720, 31, 42, 18, 1500));
    stmts.push(env.DB.prepare("UPDATE devices SET last_seen = ?1 WHERE id = 'DEV_4_LAB2'").bind(now));
    await env.DB.batch(stmts);
    return { inserted: 6, resolved: 0 };
  }

  // normalizar: lectura normal en ts=now para todos los dispositivos activos y cierre de incidencias activas.
  const [ins, , upd] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source)
       SELECT d.id, ?1, 620, 23.0, 50, CAST(s.capacity * 0.2 AS INTEGER), 650, 'sim-scenario'
         FROM devices d JOIN spaces s ON s.id = d.space_id WHERE d.active = 1`,
    ).bind(now),
    // El evento se inserta ANTES del UPDATE para seleccionar las incidencias aun activas.
    env.DB.prepare(
      `INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail)
       SELECT 'evt_' || lower(hex(randomblob(16))), id, ?1, 'resolved', ?2, 'Resuelta por el escenario normalizar (datos simulados)'
         FROM incidents WHERE status IN ${OPEN_SQL}`,
    ).bind(now, actor),
    env.DB.prepare(`UPDATE incidents SET status = 'resolved', closed_at = ?1 WHERE status IN ${OPEN_SQL}`).bind(now),
    env.DB.prepare("UPDATE devices SET last_seen = ?1 WHERE active = 1").bind(now),
    env.DB.prepare("DELETE FROM scenario_overrides"),
  ]);
  return { inserted: ins?.meta.changes ?? 0, resolved: upd?.meta.changes ?? 0 };
}
