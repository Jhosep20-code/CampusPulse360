/**
 * Constantes del gemelo 3D.
 *
 * IMPORTANTE: todas las dimensiones de este archivo son ESTIMACIONES tomadas de
 * docs/referencias/especificacion-3d.md (a partir de una fotografia; no hay
 * planos ni levantamiento de la UTP Huancayo). No son mediciones reales.
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

/** Niveles representados en el gemelo (P1-P10). El dato de 10 pisos lo aporta el equipo. */
export const TWIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Aviso obligatorio del modelo (gemelo y AR). */
export const APPROX_NOTICE = "Modelo aproximado basado en fotografía · dimensiones estimadas · sin planos verificados";
/** Rotulo obligatorio de la vista Atrio (corte de seccion). */
export const INTERIOR_NOTICE = "Interior esquemático basado en fotografías; distribución no verificada";
/** Aviso del comparador de referencia (texto exacto pedido por el equipo). */
export const REFERENCE_PRIVACY =
  "La imagen no sale de tu dispositivo. Comparación visual aproximada, sin precisión arquitectónica";
/** Rotulo de los pisos sin sensores. */
export const NO_SPACES_LABEL = "sin espacios instrumentados";

export interface BuildingDims {
  /** Huella en X (m). ESTIMACION. */
  footprintW: number;
  /** Huella en Z (m). ESTIMACION. */
  footprintD: number;
  /** Altura de la planta baja (m). ESTIMACION. */
  groundFloorHeight: number;
  /** Altura de piso tipo, P2 en adelante (m). ESTIMACION. */
  floorHeight: number;
  /** Altura de la coronacion sobre el ultimo piso (m). ESTIMACION. */
  crownH: number;
  /** Espesor de losa (m). ESTIMACION. */
  slab: number;
  /** Separacion extra por piso en vista explotada (m). Parametro visual. */
  explodeGap: number;
  /** Retiro de los espacios respecto a la fachada (m). ESTIMACION. */
  wallInset: number;
  /** Retiro del frente de los espacios (la planta baja tiene vidrio retranqueado) (m). ESTIMACION. */
  frontSetback: number;
  /** Espesor de muros macizos (m). ESTIMACION. */
  wallT: number;
  /** Ancho del pasillo perimetral al atrio (m). ESTIMACION. */
  corridorW: number;
  /** Ancho (X) y profundidad (Z) del atrio, y su desplazamiento en X (m). ESTIMACION. */
  atriumW: number;
  atriumD: number;
  atriumX: number;
  /** Ancho (X) y profundidad (Z) del nucleo de ascensores (m). ESTIMACION. */
  coreW: number;
  coreD: number;
  /** Separacion entre volumenes contiguos (m). */
  spaceGap: number;
  /** Altura libre que se resta al volumen del espacio bajo el cielo raso (m). ESTIMACION. */
  headroom: number;
  /** Muro cortina: franjas verticales y panos por franja (solo fachada +Z). ESTIMACION. */
  glassBays: number;
  panesPerBay: number;
  /** Pilastra izquierda y borde derecho del marco (m). ESTIMACION. */
  frontPierW: number;
  rightEdgeW: number;
  /** Planta baja: pilastras, retranqueo del vidrio, banda de rotulo (m). ESTIMACION. */
  groundPiers: number;
  pierSize: number;
  groundSetback: number;
  signBandH: number;
  /** Marquesina del ingreso: ancho, fondo, espesor y altura (m). ESTIMACION. */
  marqueeW: number;
  marqueeD: number;
  marqueeT: number;
  marqueeY: number;
  /** Caja tecnica de cubierta (m); centro en X/Z. ESTIMACION. */
  roofBoxW: number;
  roofBoxD: number;
  roofBoxH: number;
  roofBoxX: number;
  roofBoxZ: number;
}

export const DEFAULT_DIMS: BuildingDims = {
  footprintW: 38,
  footprintD: 30,
  groundFloorHeight: 4.8,
  floorHeight: 3.6,
  crownH: 2.4,
  slab: 0.3,
  explodeGap: 4,
  wallInset: 0.8,
  frontSetback: 1.8,
  wallT: 0.6,
  corridorW: 2.4,
  atriumW: 14,
  atriumD: 9,
  atriumX: 2,
  coreW: 7,
  coreD: 9,
  spaceGap: 0.3,
  headroom: 0.4,
  glassBays: 6,
  panesPerBay: 4,
  frontPierW: 4,
  rightEdgeW: 0.6,
  groundPiers: 7,
  pierSize: 0.6,
  groundSetback: 1.5,
  signBandH: 1.0,
  marqueeW: 10,
  marqueeD: 4,
  marqueeT: 0.25,
  marqueeY: 3.5,
  roofBoxW: 14,
  roofBoxD: 8,
  roofBoxH: 3,
  roofBoxX: -6,
  roofBoxZ: -6,
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
