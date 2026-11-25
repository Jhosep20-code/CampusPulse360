import type { CustomScenarioResponse, MetricValues, ScenarioKind, ScenarioName } from "@campuspulse/contracts";
import type { Env } from "../env";
import { HttpError } from "../lib/problem";
import { simulateReading } from "./cloud-sim";

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

/*
 * NOTA: los escenarios NO tocan devices.last_seen. last_seen solo lo actualiza la ingesta HMAC real; si un escenario
 * lo escribia, el simulador en la nube creia que habia un gateway activo y dejaba de simular TODO el campus 2 min.
 */

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
    env.DB.prepare("DELETE FROM scenario_overrides"),
  ]);
  return { inserted: ins?.meta.changes ?? 0, resolved: upd?.meta.changes ?? 0 };
}

/* ------------------------------------------------------------ escenario configurable */

type Level = "warning" | "critical";
type SpaceType = "classroom" | "lab" | "library" | "auditorium" | "lobby" | "office";

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Perfil objetivo a partir de la lectura base del espacio. Cruza los umbrales de STATUS_THRESHOLDS y de las reglas
 * sembradas (alert_rules) y solo mueve otras metricas de forma fisicamente coherente (mas gente -> algo mas de CO2).
 */
export function scenarioProfile(kind: Exclude<ScenarioKind, "offline">, level: Level, base: MetricValues, capacity: number): MetricValues {
  const cap = Math.max(1, capacity);
  const crit = level === "critical";
  switch (kind) {
    case "co2": {
      const occupancy = Math.max(base.occupancy, Math.round(cap * (crit ? 0.95 : 0.85)));
      return { ...base, co2_ppm: crit ? 1720 : 1320, occupancy, temp_c: round1(base.temp_c + (crit ? 1.2 : 0.8)) };
    }
    case "temperature":
      return { ...base, temp_c: crit ? 31.2 : 28.6, rh_pct: Math.max(30, base.rh_pct - 4) };
    case "occupancy": {
      const occupancy = Math.ceil(cap * (crit ? 1.2 : 0.95));
      return { ...base, occupancy, co2_ppm: Math.min(1150, Math.max(base.co2_ppm, 700) + (crit ? 300 : 180)) };
    }
    case "power":
      return { ...base, power_w: crit ? 6400 : 4800 };
  }
}

/**
 * Rampa: 2 lecturas hacia el objetivo (-5 y -4 min) y 4 sostenidas (-3..0 min). Asi las reglas con sustain de
 * hasta 180 s se cumplen en el siguiente tick del bot (historial acelerado, rotulado 'sim-scenario').
 */
export function scenarioRamp(base: MetricValues, target: MetricValues): MetricValues[] {
  const mix = (t: number): MetricValues => ({
    co2_ppm: Math.round(base.co2_ppm + (target.co2_ppm - base.co2_ppm) * t),
    temp_c: round1(base.temp_c + (target.temp_c - base.temp_c) * t),
    rh_pct: Math.round(base.rh_pct + (target.rh_pct - base.rh_pct) * t),
    occupancy: Math.round(base.occupancy + (target.occupancy - base.occupancy) * t),
    power_w: Math.round(base.power_w + (target.power_w - base.power_w) * t),
  });
  return [mix(1 / 3), mix(2 / 3), target, target, target, target];
}

interface DeviceSpace {
  device_id: string;
  capacity: number;
  type: SpaceType;
}

async function deviceForSpace(env: Env, spaceId: string): Promise<DeviceSpace> {
  const row = await env.DB.prepare(
    "SELECT d.id AS device_id, s.capacity, s.type FROM devices d JOIN spaces s ON s.id = d.space_id WHERE s.id = ?1 AND d.active = 1 LIMIT 1",
  )
    .bind(spaceId)
    .first<DeviceSpace>();
  if (!row) throw new HttpError(404, "Espacio sin dispositivo activo");
  return row;
}

const CMP: Record<string, (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
};

const UPSERT_CUSTOM =
  `INSERT OR REPLACE INTO scenario_overrides (device_id, scenario, started_at, until, co2_ppm, temp_c, rh_pct, occupancy, power_w, mode)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`;

export async function applyCustomScenario(
  env: Env,
  req: { space_id: string; kind: ScenarioKind; level: Level; duration_min: number },
  now: number,
): Promise<CustomScenarioResponse> {
  const dev = await deviceForSpace(env, req.space_id);
  const until = now + req.duration_min * MIN;
  const last = await env.DB.prepare(
    "SELECT co2_ppm, temp_c, rh_pct, occupancy, power_w FROM readings WHERE device_id = ?1 AND source = 'sim' ORDER BY ts DESC LIMIT 1",
  )
    .bind(dev.device_id)
    .first<MetricValues>();
  const base: MetricValues = last ?? simulateReading({ id: dev.device_id, type: dev.type, capacity: dev.capacity }, now);
  const common = { space_id: req.space_id, device_id: dev.device_id, kind: req.kind, level: req.level, started_at: now, until };

  if (req.kind === "offline") {
    // Sin conexion: no se inventan ni se borran lecturas. El bot y el simulador dejan de producirlas y el estado pasa a
    // "sin conexion" a los 3 min sin datos (OFFLINE_AFTER_MS), igual que con un sensor real caido.
    await env.DB.prepare(UPSERT_CUSTOM)
      .bind(dev.device_id, "custom:offline", now, until, base.co2_ppm, base.temp_c, base.rh_pct, base.occupancy, base.power_w, "offline")
      .run();
    return { ...common, inserted: 0, profile: null, expected_rules: [] };
  }

  const target = scenarioProfile(req.kind, req.level, base, dev.capacity);
  const ramp = scenarioRamp(base, target);
  const stmts: D1PreparedStatement[] = [env.DB.prepare(CLEAR_SIM_WINDOW).bind(dev.device_id, now - 6 * MIN, now)];
  ramp.forEach((v, i) => {
    stmts.push(env.DB.prepare(INSERT_READING).bind(dev.device_id, now - (5 - i) * MIN, v.co2_ppm, v.temp_c, v.rh_pct, v.occupancy, v.power_w));
  });
  stmts.push(
    env.DB.prepare(UPSERT_CUSTOM).bind(
      dev.device_id,
      `custom:${req.kind}:${req.level}`,
      now,
      until,
      target.co2_ppm,
      target.temp_c,
      target.rh_pct,
      target.occupancy,
      target.power_w,
      "values",
    ),
  );
  await env.DB.batch(stmts);

  const { results: rules } = await env.DB.prepare(
    "SELECT id, name, metric, op, threshold, severity FROM alert_rules WHERE enabled = 1",
  ).all<{ id: string; name: string; metric: string; op: string; threshold: number; severity: string }>();
  const values: Record<string, number> = { ...target, occupancy_ratio: target.occupancy / Math.max(1, dev.capacity) };
  const expected = rules
    .filter((r) => {
      const v = values[r.metric];
      const cmp = CMP[r.op];
      return v !== undefined && cmp !== undefined && cmp(v, r.threshold);
    })
    .map((r) => ({ id: r.id, name: r.name, severity: r.severity }));
  return { ...common, inserted: ramp.length, profile: target, expected_rules: expected };
}

/** Restaura un espacio: quita su escenario, registra una lectura normal simulada y cierra SUS incidencias activas. */
export async function restoreSpace(env: Env, spaceId: string, now: number, actor: string): Promise<{ resolved: number; removed: number }> {
  const dev = await deviceForSpace(env, spaceId);
  const v = simulateReading({ id: dev.device_id, type: dev.type, capacity: dev.capacity }, now);
  const res = await env.DB.batch([
    env.DB.prepare("DELETE FROM scenario_overrides WHERE device_id = ?1").bind(dev.device_id),
    env.DB.prepare(
      "INSERT OR REPLACE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sim')",
    ).bind(dev.device_id, now, v.co2_ppm, v.temp_c, v.rh_pct, v.occupancy, v.power_w),
    env.DB.prepare(
      `INSERT INTO incident_events (id, incident_id, ts, kind, actor, detail)
       SELECT 'evt_' || lower(hex(randomblob(16))), id, ?1, 'resolved', ?2, 'Resuelta al restaurar la simulacion del espacio (datos simulados)'
         FROM incidents WHERE space_id = ?3 AND status IN ${OPEN_SQL}`,
    ).bind(now, actor, spaceId),
    env.DB.prepare(`UPDATE incidents SET status = 'resolved', closed_at = ?1 WHERE space_id = ?2 AND status IN ${OPEN_SQL}`).bind(now, spaceId),
  ]);
  return { removed: res[0]?.meta.changes ?? 0, resolved: res[3]?.meta.changes ?? 0 };
}
