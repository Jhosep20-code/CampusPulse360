import { env } from "cloudflare:workers";
import type { Env } from "../src/env";

export const E = env as unknown as Env;
export const NOW = 1_900_000_000_000;
export const MIN = 60_000;

const TABLES = ["readings", "readings_5m", "incident_events", "incidents", "ai_outputs", "ai_quota", "bot_runs", "reports"];

export async function reset(): Promise<void> {
  await E.DB.batch(TABLES.map((t) => E.DB.prepare(`DELETE FROM ${t}`)));
  await E.DB.prepare("UPDATE devices SET last_seen = NULL").run();
}

export interface Vals {
  co2?: number;
  temp?: number;
  rh?: number;
  occ?: number;
  power?: number;
}

export async function putReadings(device: string, rows: Array<{ ts: number } & Vals>): Promise<void> {
  const st = E.DB.prepare(
    "INSERT OR REPLACE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source) VALUES (?1,?2,?3,?4,?5,?6,?7,'sim')",
  );
  await E.DB.batch(rows.map((r) => st.bind(device, r.ts, r.co2 ?? 600, r.temp ?? 23, r.rh ?? 50, r.occ ?? 5, r.power ?? 500)));
}

/** Lecturas cada minuto desde now - minutes hasta now (inclusive). */
export async function putSustained(device: string, now: number, minutes: number, v: Vals): Promise<void> {
  const rows = [];
  for (let m = minutes; m >= 0; m--) rows.push({ ts: now - m * MIN, ...v });
  await putReadings(device, rows);
}

export async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const r = await E.DB.prepare(sql).bind(...binds).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function insertIncident(id: string, spaceId: string, ruleId: string, now: number): Promise<void> {
  await E.DB.prepare(
    "INSERT INTO incidents (id, space_id, rule_id, title, status, severity, opened_at, dedup_key) VALUES (?1,?2,?3,'Incidencia de prueba','pending_ai','critical',?4,?5)",
  )
    .bind(id, spaceId, ruleId, now, `${spaceId}:${ruleId}`)
    .run();
}
