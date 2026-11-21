/**
 * Constantes del gemelo 3D.
 *
 * IMPORTANTE: todas las dimensiones de este archivo son ESTIMACIONES del
 * prototipo (no hay fotos ni planos de la UTP Huancayo todavia). No son
 * mediciones reales del edificio. Cuando exista el GLB de Blender, las
 * dimensiones saldran del modelo y este bloque solo servira para la
 * geometria procedural de respaldo.
 */

/**
 * Ruta del modelo GLB (p. ej. "/models/utp-huancayo.glb"). null = geometria
 * procedural provisional.
 *
 * Cuando es una ruta:
 * - las mallas cuyo nombre empieza por SPC_ son los volumenes de espacio
 *   (coloreables y seleccionables, nombre = mesh_id del contrato);
 * - el resto del GLB se trata como fachada/estructura.
 * Ver assets/3d/README.md.
 */
export const MODEL_URL: string | null = null;

export const SPACE_MESH_PREFIX = "SPC_";
/** Nodos opcionales de fachada por piso (FLR_<piso>_*) que acompanan la vista explotada. */
export const FLOOR_NODE_PREFIX = "FLR_";

export interface BuildingDims {
  /** Huella en X (m). ESTIMACION. */
  footprintW: number;
  /** Huella en Z (m). ESTIMACION. */
  footprintD: number;
  /** Altura de piso a piso (m). ESTIMACION. */
  floorHeight: number;
  /** Espesor de losa (m). ESTIMACION. */
  slab: number;
  /** Separacion extra por piso en vista explotada (m). Parametro visual. */
  explodeGap: number;
  /** Retiro de los espacios respecto a la fachada (m). ESTIMACION. */
  wallInset: number;
  /** Ancho del pasillo central (m). ESTIMACION. */
  corridorW: number;
  /** Ancho (X) del nucleo de circulacion (m). ESTIMACION. */
  coreW: number;
  /** Profundidad (Z) del nucleo de circulacion (m). ESTIMACION. */
  coreD: number;
  /** Separacion entre volumenes contiguos (m). */
  spaceGap: number;
  /** Altura libre que se resta al volumen del espacio bajo el cielo raso (m). ESTIMACION. */
  headroom: number;
  /** Modulo de montantes del muro cortina (m). ESTIMACION. */
  mullionPitch: number;
  /** Altura del zocalo (m). ESTIMACION. */
  plinthH: number;
  /** Margen del zocalo respecto a la huella (m). ESTIMACION. */
  plinthMargin: number;
  /** Altura del parapeto de cubierta (m). ESTIMACION. */
  parapetH: number;
  /** Altura del antepecho opaco bajo el vidrio (m). ESTIMACION. */
  spandrelH: number;
}

export const DEFAULT_DIMS: BuildingDims = {
  footprintW: 48,
  footprintD: 22,
  floorHeight: 3.6,
  slab: 0.3,
  explodeGap: 4,
  wallInset: 0.8,
  corridorW: 2.4,
  coreW: 5.2,
  coreD: 8.4,
  spaceGap: 0.3,
  headroom: 0.4,
  mullionPitch: 1.5,
  plinthH: 0.6,
  plinthMargin: 1.5,
  parapetH: 0.9,
  spandrelH: 0.85,
};

/** Identidad visual (CLAUDE.md) + rojo critico del gemelo. */
export const PALETTE = {
  bg: "#080F1D",
  bgNight: "#04080F",
  panel: "#17243A",
  border: "#24344F",
  blue: "#2962FF",
  cyan: "#22D3D6",
  gold: "#F0B95B",
  critical: "#FF5C7A",
  offline: "#64748B",
  text: "#E6EDF7",
} as const;

/** Tope de la rampa de la capa energia (W por espacio). Parametro de visualizacion, no medicion. */
export const ENERGY_RAMP_MAX_W = 6000;

/** Rango de la rampa de CO2 (ppm): 400 (exterior tipico) a 1500 (umbral critico). */
export const CO2_RAMP = { min: 400, max: 1500 } as const;
/** Rango de la rampa de temperatura (C). */
export const TEMP_RAMP = { min: 18, max: 30 } as const;
