import type { BatchKey } from "./facade";

/**
 * Materiales PBR del edificio (especificacion-3d.md, 5.3). Datos puros: los usan el
 * gemelo (three en CampusTwin) y la AR / exportacion GLB (ar/model.ts). Valores de
 * partida ESTIMADOS.
 */
export interface MatSpec {
  color: string;
  roughness: number;
  metalness: number;
  /** Opacidad en modo realista (1 = opaco). */
  opacity: number;
  /** Opacidad en modo datos / piso aislado. */
  opacityData: number;
  /** Opacidad en la AR (maqueta). */
  opacityAr: number;
  clearcoat?: number;
}

const S = (
  color: string,
  roughness: number,
  metalness: number,
  extra: Partial<Pick<MatSpec, "opacity" | "opacityData" | "opacityAr" | "clearcoat">> = {},
): MatSpec => ({
  color,
  roughness,
  metalness,
  opacity: 1,
  opacityData: extra.opacityData ?? extra.opacity ?? 1,
  opacityAr: extra.opacityAr ?? extra.opacity ?? 1,
  ...(extra.opacity !== undefined ? { opacity: extra.opacity } : {}),
  ...(extra.clearcoat !== undefined ? { clearcoat: extra.clearcoat } : {}),
});

export const MATERIAL_SPECS: Record<BatchKey, MatSpec> = {
  // Ajustado tras comparar con la foto real: azul reflectante saturado y casi opaco desde fuera.
  glass: S("#3A78C2", 0.04, 0.55, { opacity: 0.93, opacityData: 0.25, opacityAr: 0.7, clearcoat: 0.7 }),
  white: S("#E6E8EA", 0.6, 0, { opacityData: 0.2 }),
  frame: S("#1A1F26", 0.4, 0.6, { opacityData: 0.7 }),
  glassGround: S("#0E1724", 0.1, 0.3, { opacity: 0.85, opacityData: 0.3, opacityAr: 0.85 }),
  roof: S("#B9BEC4", 0.85, 0),
  red: S("#C8102E", 0.5, 0),
  slab: S("#8E97A4", 0.7, 0.1),
  led: S("#FFFFFF", 0.5, 0),
  coreBlack: S("#0B0C0F", 0.12, 0.6),
  steel: S("#B7C0CC", 0.3, 0.9),
  tile: S("#D9D2C5", 0.55, 0),
  hedge: S("#2F5D34", 1, 0),
  sidewalk: S("#7A8496", 0.9, 0),
  asphalt: S("#2A2F38", 0.95, 0),
  context: S("#1A2436", 0.9, 0),
  lampHead: S("#FFE9B8", 0.5, 0),
};

/** Color del dia de los elementos de entorno (la especificacion da el valor nocturno/base). */
export const DAY_COLORS = {
  context: "#A08676", // ciudad baja de ladrillo y tarrajeo (foto)
  hills: "#5B6A4C", // cerros verde-pardo (foto)
  ground: "#6C7684",
  sidewalk: "#A3ABB8",
  asphalt: "#4A505B",
} as const;
export const NIGHT_COLORS = {
  hills: "#0E1A2E",
  ground: "#0B1527",
} as const;
export const SKY = {
  dayTop: "#5E93CB",
  dayHorizon: "#BCD6EC",
  nightTop: "#04080F",
  nightHorizon: "#0C1730",
} as const;
/** Lightformers del entorno (cielo y horizonte de cerros). */
export const ENV_COLORS = { sky: "#9CC8F0", horizon: "#4A5A44" } as const;
/** Direccion del sol (especificacion 5.3). */
export const SUN_POSITION: [number, number, number] = [-40, 70, 35];
export const WINDOW_LIT = "#FFF1E2";
