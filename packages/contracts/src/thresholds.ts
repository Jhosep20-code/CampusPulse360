import type { MetricValues, SpaceStatus } from "./domain";

/**
 * Umbrales por defecto para el estado visual (dashboard y gemelo 3D).
 * Referencias de diseno (no mediciones): CO2 interior de 1000 ppm es un valor
 * guia habitual de ventilacion; los demas son parametros del prototipo.
 * Las reglas de incidencias (tabla alert_rules) son configurables aparte.
 */
export const STATUS_THRESHOLDS = {
  co2_ppm: { warning: 1000, critical: 1500 },
  temp_c: { warning: 27, critical: 30 },
  occupancy_ratio: { warning: 0.9, critical: 1.1 },
  /** Consumo por espacio (W). Normal: 600-3.300 W segun tipo y ocupacion; igual que RULE_POWER_HIGH/CRIT. */
  power_w: { warning: 4500, critical: 6000 },
} as const;

/** Un dispositivo se considera offline si no reporta en este intervalo. */
export const OFFLINE_AFTER_MS = 3 * 60_000;

const rank: Record<SpaceStatus, number> = { ok: 0, warning: 1, critical: 2, offline: 3 };

export function worstStatus(a: SpaceStatus, b: SpaceStatus): SpaceStatus {
  return rank[a] >= rank[b] ? a : b;
}

/** Calcula el estado de un espacio a partir de su ultima lectura. */
export function statusFromMetrics(
  m: MetricValues | null,
  capacity: number,
  lastTs: number | null,
  now: number,
): SpaceStatus {
  if (!m || lastTs === null || now - lastTs > OFFLINE_AFTER_MS) return "offline";
  let s: SpaceStatus = "ok";
  const t = STATUS_THRESHOLDS;
  if (m.co2_ppm >= t.co2_ppm.critical) s = worstStatus(s, "critical");
  else if (m.co2_ppm >= t.co2_ppm.warning) s = worstStatus(s, "warning");
  if (m.temp_c >= t.temp_c.critical) s = worstStatus(s, "critical");
  else if (m.temp_c >= t.temp_c.warning) s = worstStatus(s, "warning");
  const ratio = capacity > 0 ? m.occupancy / capacity : 0;
  if (ratio >= t.occupancy_ratio.critical) s = worstStatus(s, "critical");
  else if (ratio >= t.occupancy_ratio.warning) s = worstStatus(s, "warning");
  if (m.power_w >= t.power_w.critical) s = worstStatus(s, "critical");
  else if (m.power_w >= t.power_w.warning) s = worstStatus(s, "warning");
  return s;
}
