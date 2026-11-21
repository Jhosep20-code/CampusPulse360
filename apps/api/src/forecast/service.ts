import type { ForecastResponse, Metric } from "@campuspulse/contracts";
import type { Env } from "../env";
import { fitHolt, holt, MIN_POINTS_FOR_MAE } from "./holt";

const BUCKET_MS = 300_000; // 5 min
const WINDOW_MS = 6 * 3_600_000;
const HORIZON_STEPS = 6; // 6 x 5 min = 30 min

/** Lista blanca: el nombre de metrica se interpola en SQL, nunca desde entrada libre. */
const COLUMN: Record<Metric, string> = {
  co2_ppm: "co2_ppm",
  temp_c: "temp_c",
  rh_pct: "rh_pct",
  occupancy: "occupancy",
  power_w: "power_w",
};

const CLAMP: Record<Metric, [number, number]> = {
  co2_ppm: [0, 10000],
  temp_c: [-30, 80],
  rh_pct: [0, 100],
  occupancy: [0, 5000],
  power_w: [0, 1_000_000],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Prevision Holt a 30 min sobre buckets de 5 min de las ultimas 6 h del
 * dispositivo del espacio. Agregacion en SQL; solo ~72 puntos llegan a JS.
 * Los datos son simulados, igual que el MAE devuelto. null si el espacio no existe.
 */
export async function forecastForSpace(
  env: Env,
  spaceId: string,
  metric: Metric,
  now: number,
): Promise<ForecastResponse | null> {
  const col = COLUMN[metric];
  if (!col) return null;
  const sp = await env.DB.prepare(
    `SELECT s.id AS id,
            (SELECT d.id FROM devices d WHERE d.space_id = s.id AND d.active = 1 ORDER BY d.id LIMIT 1) AS device_id
       FROM spaces s WHERE s.id = ?1`,
  )
    .bind(spaceId)
    .first<{ id: string; device_id: string | null }>();
  if (!sp) return null;

  const base: ForecastResponse = {
    space_id: sp.id,
    metric,
    method: "holt",
    horizon_min: (HORIZON_STEPS * BUCKET_MS) / 60_000,
    mae: null,
    history: [],
    forecast: [],
  };
  if (!sp.device_id) return base;

  const { results } = await env.DB.prepare(
    `SELECT (ts / ${BUCKET_MS}) * ${BUCKET_MS} AS bucket, AVG(${col}) AS v
       FROM readings
      WHERE device_id = ?1 AND ts > ?2 AND ts <= ?3
      GROUP BY bucket
      ORDER BY bucket`,
  )
    .bind(sp.device_id, now - WINDOW_MS, now)
    .all<{ bucket: number; v: number }>();
  if (results.length === 0) return base;

  const values = results.map((r) => r.v);
  const fit = fitHolt(values, HORIZON_STEPS);
  const preds = holt(values, fit.alpha, fit.beta, HORIZON_STEPS);
  const [lo, hi] = CLAMP[metric];
  const lastBucket = results[results.length - 1]?.bucket ?? now;

  return {
    ...base,
    mae: values.length < MIN_POINTS_FOR_MAE || fit.mae === null ? null : r2(fit.mae),
    history: results.map((r) => ({ ts: r.bucket, value: r2(r.v) })),
    forecast: preds.map((p, i) => ({
      ts: lastBucket + (i + 1) * BUCKET_MS,
      value: r2(Math.min(hi, Math.max(lo, p))),
    })),
  };
}
