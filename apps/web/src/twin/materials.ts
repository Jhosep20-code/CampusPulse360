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
  /** Intensidad del entorno reflejado (solo gemelo; 1 por defecto). */
  envMapIntensity?: number;
}

const S = (
  color: string,
  roughness: number,
  metalness: number,
  extra: Partial<Pick<MatSpec, "opacity" | "opacityData" | "opacityAr" | "clearcoat" | "envMapIntensity">> = {},
): MatSpec => ({
  color,
  roughness,
  metalness,
  opacity: 1,
  opacityData: extra.opacityData ?? extra.opacity ?? 1,
  opacityAr: extra.opacityAr ?? extra.opacity ?? 1,
  ...(extra.opacity !== undefined ? { opacity: extra.opacity } : {}),
  ...(extra.clearcoat !== undefined ? { clearcoat: extra.clearcoat } : {}),
  ...(extra.envMapIntensity !== undefined ? { envMapIntensity: extra.envMapIntensity } : {}),
});

export const MATERIAL_SPECS: Record<BatchKey, MatSpec> = {
  // Azul reflectante (foto real). Clearcoat alto y entorno intenso para que refleje cielo y cerros;
  // la opacidad deja ver el borde de losa tras el vidrio, sin volverlo transparente.
  glass: S("#2F6DB5", 0.04, 0.5, { opacity: 0.92, opacityData: 0.25, opacityAr: 0.7, clearcoat: 1, envMapIntensity: 2.3 }),
  white: S("#E6E8EA", 0.6, 0, { opacityData: 0.2 }),
  // Carpinteria anodizada oscura: metal con algo de brillo.
  frame: S("#1B2027", 0.34, 0.7, { opacityData: 0.7, envMapIntensity: 1.5 }),
  glassGround: S("#0E1724", 0.08, 0.35, { opacity: 0.86, opacityData: 0.3, opacityAr: 0.85, envMapIntensity: 1.6 }),
  // Vidrio claro: hojas de las puertas de ingreso y tabiques interiores (tinte cian de las fotos).
  glassClear: S("#8FD0DC", 0.05, 0.1, { opacity: 0.4, opacityData: 0.3, opacityAr: 0.45, envMapIntensity: 1.4 }),
  roof: S("#B9BEC4", 0.85, 0),
  red: S("#C8102E", 0.5, 0),
  slab: S("#8E97A4", 0.7, 0.1),
  led: S("#FFFFFF", 0.5, 0),
  coreBlack: S("#0B0C0F", 0.12, 0.6, { envMapIntensity: 1.3 }),
  steel: S("#B7C0CC", 0.3, 0.9),
  tile: S("#D9D2C5", 0.55, 0),
  ceiling: S("#F4F5F6", 0.9, 0),
  fixture: S("#FFF6E6", 0.5, 0),
  wood: S("#C8955A", 0.55, 0),
  furnDark: S("#15181E", 0.55, 0.1),
  screen: S("#4A94EA", 0.3, 0),
  // El color real de cada lomo va por instancia (instanceColor).
  books: S("#FFFFFF", 0.8, 0),
  hedge: S("#2F5D34", 1, 0),
  sidewalk: S("#7A8496", 0.9, 0),
  asphalt: S("#2A2F38", 0.95, 0),
  // Base del contexto: el color de cada edificio va por instancia (ladrillo, tarrajeo, techos).
  context: S("#1A2436", 0.9, 0),
  lampHead: S("#FFE9B8", 0.5, 0),
};

/** Color del dia de los elementos de entorno (la especificacion da el valor nocturno/base). */
export const DAY_COLORS = {
  /** Multiplicador del contexto de dia (los colores reales van por instancia). */
  context: "#FFFFFF",
  hills: "#5B6A4C", // cerros verde-pardo (foto)
  ground: "#6C7684",
  sidewalk: "#A3ABB8",
  asphalt: "#4A505B",
} as const;
export const NIGHT_COLORS = {
  /** Multiplicador del contexto de noche. */
  context: "#34405A",
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
/** Luz de relleno interior de la vista Atrio (calida-neutra) y su posicion. */
export const INTERIOR_FILL = { color: "#FFE6C2", position: [6, 26, 70] as [number, number, number] };
