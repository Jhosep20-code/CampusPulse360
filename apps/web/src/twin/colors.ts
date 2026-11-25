import { STATUS_THRESHOLDS, type LiveSpace, type SpaceStatus } from "@campuspulse/contracts";
import { CO2_RAMP, ENERGY_RAMP_MAX_W, PALETTE, TEMP_RAMP } from "./constants";
import type { TwinLayer } from "./types";

/** Funciones puras de color del gemelo. Sin dependencias de three ni React. */

export const STATUS_COLORS: Record<SpaceStatus, string> = {
  ok: PALETTE.cyan,
  warning: PALETTE.gold,
  critical: PALETTE.critical,
  offline: PALETTE.offline,
};

export const STATUS_LABEL: Record<SpaceStatus, string> = {
  ok: "Normal",
  warning: "Advertencia",
  critical: "Crítico",
  offline: "Sin conexión",
};

export const LAYER_LABEL: Record<TwinLayer, string> = {
  status: "Estado",
  co2: "CO₂",
  temperature: "Temperatura",
  occupancy: "Ocupación",
  energy: "Energía",
};

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

type Stop = readonly [number, string];

/** Interpola una rampa por tramos. Los stops deben estar ordenados por posicion. */
function ramp(stops: readonly Stop[], t: number): string {
  const x = clamp01(t);
  let prev: Stop = stops[0] ?? [0, PALETTE.offline];
  for (const stop of stops) {
    if (x <= stop[0]) {
      const span = stop[0] - prev[0];
      return span <= 0 ? stop[1] : mixHex(prev[1], stop[1], (x - prev[0]) / span);
    }
    prev = stop;
  }
  return prev[1];
}

/*
 * Rampas frio -> calido. Los puntos intermedios coinciden con los umbrales de
 * STATUS_THRESHOLDS (CO2 1000/1500 ppm, temperatura 27/30 C, ocupacion 90/110 %)
 * para que dorado y rojo aparezcan donde el estado cambia.
 */
const COLD = "#1E56E6";
const RAMP_CO2: readonly Stop[] = [
  [0, PALETTE.cyan],
  [0.55, PALETTE.gold],
  [1, PALETTE.critical],
];
const RAMP_TEMP: readonly Stop[] = [
  [0, COLD],
  [0.35, PALETTE.cyan],
  [0.75, PALETTE.gold],
  [1, PALETTE.critical],
];
const RAMP_OCC: readonly Stop[] = [
  [0, PALETTE.cyan],
  [0.82, PALETTE.gold],
  [1, PALETTE.critical],
];
const RAMP_ENERGY: readonly Stop[] = [
  [0, COLD],
  [0.3, PALETTE.cyan],
  [0.7, PALETTE.gold],
  [1, PALETTE.critical],
];

export function co2Color(ppm: number): string {
  return ramp(RAMP_CO2, (ppm - CO2_RAMP.min) / (CO2_RAMP.max - CO2_RAMP.min));
}
export function temperatureColor(c: number): string {
  return ramp(RAMP_TEMP, (c - TEMP_RAMP.min) / (TEMP_RAMP.max - TEMP_RAMP.min));
}
/** ratio = ocupacion / capacidad; 1,1 (110 %) satura la rampa. */
export function occupancyColor(ratio: number): string {
  return ramp(RAMP_OCC, ratio / 1.1);
}
export function energyColor(watts: number): string {
  return ramp(RAMP_ENERGY, watts / ENERGY_RAMP_MAX_W);
}

/** Color de un espacio para la capa activa. Sin dato (o espacio offline) -> gris offline. */
export function colorForSpace(
  layer: TwinLayer,
  live: LiveSpace | null | undefined,
  capacity: number,
): string {
  if (!live || live.status === "offline") return STATUS_COLORS.offline;
  if (layer === "status") return STATUS_COLORS[live.status];
  const m = live.metrics;
  if (!m) return STATUS_COLORS.offline;
  switch (layer) {
    case "co2":
      return co2Color(m.co2_ppm);
    case "temperature":
      return temperatureColor(m.temp_c);
    case "occupancy":
      return occupancyColor(capacity > 0 ? m.occupancy / capacity : 0);
    case "energy":
      return energyColor(m.power_w);
  }
}

/**
 * Intensidad de las ventanas en modo noche segun ocupacion (0..1).
 * Un espacio vacio conserva una luz minima de 0,08; acotado en [0,1].
 */
export function emissiveForNight(occupancyRatio: number): number {
  const r = Number.isFinite(occupancyRatio) ? clamp01(occupancyRatio) : 0;
  return 0.08 + 0.92 * Math.pow(r, 0.75);
}

const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

/** Valor principal de la capa, para etiquetas y alternativa textual. */
export function primaryValueLabel(
  layer: TwinLayer,
  live: LiveSpace | null | undefined,
  capacity: number,
): string {
  if (!live || live.status === "offline") return STATUS_LABEL.offline;
  const m = live.metrics;
  if (layer === "status" || !m) return STATUS_LABEL[live.status];
  switch (layer) {
    case "co2":
      return `${Math.round(m.co2_ppm)} ppm`;
    case "temperature":
      return `${fmt1(m.temp_c)} °C`;
    case "occupancy":
      return `${m.occupancy}/${capacity} pers.`;
    case "energy":
      return m.power_w >= 1000 ? `${fmt1(m.power_w / 1000)} kW` : `${Math.round(m.power_w)} W`;
  }
}

/** Causa dominante del estado de un espacio (para la baliza): la metrica que cruza el umbral MAS severo. */
export interface StatusCause {
  metric: "co2" | "temperature" | "occupancy" | "power" | "offline" | null;
  label: string;
}

const nf0 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function statusCause(live: LiveSpace | undefined, capacity: number): StatusCause {
  if (!live || live.status === "offline" || !live.metrics) return { metric: "offline", label: "sin conexión" };
  if (live.status === "ok") return { metric: null, label: STATUS_LABEL.ok };
  const m = live.metrics;
  const t = STATUS_THRESHOLDS;
  const ratio = capacity > 0 ? m.occupancy / capacity : 0;
  const candidates: Array<{ level: number; cause: StatusCause }> = [
    { level: m.co2_ppm >= t.co2_ppm.critical ? 2 : m.co2_ppm >= t.co2_ppm.warning ? 1 : 0, cause: { metric: "co2", label: `CO₂ ${nf0.format(m.co2_ppm)} ppm` } },
    { level: m.temp_c >= t.temp_c.critical ? 2 : m.temp_c >= t.temp_c.warning ? 1 : 0, cause: { metric: "temperature", label: `${nf1.format(m.temp_c)} °C` } },
    {
      level: ratio >= t.occupancy_ratio.critical ? 2 : ratio >= t.occupancy_ratio.warning ? 1 : 0,
      cause: { metric: "occupancy", label: `${nf0.format(m.occupancy)}/${nf0.format(capacity)} personas` },
    },
    { level: m.power_w >= t.power_w.critical ? 2 : m.power_w >= t.power_w.warning ? 1 : 0, cause: { metric: "power", label: `${nf1.format(m.power_w / 1000)} kW` } },
  ];
  const top = candidates.reduce((a, b) => (b.level > a.level ? b : a));
  return top.level > 0 ? top.cause : { metric: null, label: STATUS_LABEL[live.status] };
}
