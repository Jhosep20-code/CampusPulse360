import type { BatchKey } from "./facade";

/*
 * Logica PURA del modelo GLB de Blender (assets/3d/README.md): nombres de nodos,
 * clasificacion, plan de fusion de mallas y bandas de nivel. Sin three ni React,
 * para poder probarla sin WebGL.
 */

/** Grupos compartidos que atraviesan varios pisos (el resto del modelo cuelga de FLOOR_Pxx). */
export const SHARED_GROUPS = ["FACADE", "ATRIUM", "STAIRS", "ELEVATORS", "ROOF"] as const;
export type SharedGroup = (typeof SHARED_GROUPS)[number];
/** Grupos compartidos de todo el alto que se recortan a la franja de cada piso (ROOF va con el ultimo piso). */
export const SLICED_GROUPS: readonly SharedGroup[] = ["FACADE", "ATRIUM", "STAIRS", "ELEVATORS"];

export type NodeClass =
  | { kind: "root" }
  | { kind: "context" }
  | { kind: "floor"; level: number }
  | { kind: "floorPart"; level: number }
  | { kind: "shared"; group: SharedGroup }
  | { kind: "space"; meshId: string }
  | { kind: "anchors" }
  | { kind: "anchor"; meshId: string }
  | { kind: "other" };

const FLOOR_RE = /^FLOOR_P(\d{1,2})$/;
const FLOOR_PART_RE = /^FLOOR_P(\d{1,2})_/;
const SPACE_RE = /^SPC_\d{1,2}_[A-Z0-9]{2,12}$/;
const ANCHOR_RE = /^ANCHOR_(SPC_\d{1,2}_[A-Z0-9]{2,12})$/;

/** Quita sufijos de duplicado de Blender ("FLOOR_P03.001" -> "FLOOR_P03"). */
export function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}

/** "FLOOR_P03" -> 3; cualquier otro nombre -> null. */
export function floorLevelFromName(name: string): number | null {
  const m = FLOOR_RE.exec(baseName(name));
  return m?.[1] ? Number.parseInt(m[1], 10) : null;
}

export function floorNodeName(level: number): string {
  return `FLOOR_P${String(level).padStart(2, "0")}`;
}

export function isSpaceName(name: string): boolean {
  return SPACE_RE.test(baseName(name));
}

export function classifyNode(rawName: string): NodeClass {
  const name = baseName(rawName);
  if (name === "BUILDING") return { kind: "root" };
  if (name === "CONTEXT") return { kind: "context" };
  if (name === "SENSOR_ANCHORS") return { kind: "anchors" };
  const a = ANCHOR_RE.exec(name);
  if (a?.[1]) return { kind: "anchor", meshId: a[1] };
  if (SPACE_RE.test(name)) return { kind: "space", meshId: name };
  const level = floorLevelFromName(name);
  if (level !== null) return { kind: "floor", level };
  const part = FLOOR_PART_RE.exec(name);
  if (part?.[1]) return { kind: "floorPart", level: Number.parseInt(part[1], 10) };
  for (const g of SHARED_GROUPS) {
    if (name === g || name.startsWith(`${g}_`)) return { kind: "shared", group: g };
  }
  return { kind: "other" };
}

/** Mesh id del volumen de espacio de una ventana nocturna ("A201" en el piso 2 -> "SPC_2_A201"). */
export function windowSpaceMeshId(level: number, spaceCode: string): string {
  return `SPC_${level}_${spaceCode}`;
}

/* ------------------------------------------------------------ fusion */

export interface MergeItem {
  id: string;
  /** Grupo destino de la fusion (p. ej. FLOOR_P03, WHOLE, SLICE). */
  group: string;
  /** Nombre del material de Blender. */
  material: string;
}

export interface MergeBucket {
  key: string;
  group: string;
  material: string;
  ids: string[];
}

export function mergeKey(group: string, material: string): string {
  return `${group}|${material}`;
}

/**
 * Agrupa por (grupo x material) conservando el orden de aparicion. Cada cubeta se
 * fusiona en UNA malla, lo que reduce los draw calls sin mezclar pisos.
 */
export function planMerge(items: readonly MergeItem[]): MergeBucket[] {
  const buckets = new Map<string, MergeBucket>();
  for (const it of items) {
    const key = mergeKey(it.group, it.material);
    const b = buckets.get(key);
    if (b) b.ids.push(it.id);
    else buckets.set(key, { key, group: it.group, material: it.material, ids: [it.id] });
  }
  return [...buckets.values()];
}

/* ------------------------------------------------------------ niveles */

export interface FloorBand {
  level: number;
  /** Posicion en la pila (0 = planta baja). */
  index: number;
  /** Cota de la cara inferior de la losa (m). */
  baseY: number;
  /** Altura del piso, losa incluida (m). */
  height: number;
}

const FAR = 1000;

/**
 * Franja Y que ocupa un piso para recortar los grupos compartidos. La planta baja se
 * extiende hacia abajo (cimientos) y el ultimo piso hacia arriba (coronacion).
 */
export function sliceRange(bands: readonly FloorBand[], level: number): { lo: number; hi: number } | null {
  const sorted = [...bands].sort((a, b) => a.baseY - b.baseY);
  const i = sorted.findIndex((b) => b.level === level);
  const b = sorted[i];
  if (!b) return null;
  return { lo: i === 0 ? -FAR : b.baseY, hi: i === sorted.length - 1 ? FAR : b.baseY + b.height };
}

/** Nivel cuyo rango contiene la cota y (modelo sin explotar); null fuera del edificio o en la coronacion. */
export function floorLevelAtY(y: number, bands: readonly FloorBand[]): number | null {
  for (const b of bands) {
    if (y >= b.baseY && y < b.baseY + b.height) return b.level;
  }
  return null;
}

/* ------------------------------------------------------------ materiales */

/** Material de Blender -> clave del visor (para reutilizar las especificaciones de materials.ts). */
export const GLB_MATERIAL_KEY: Readonly<Record<string, BatchKey>> = {
  GLASS_CURTAIN: "glass",
  WHITE_PANEL: "white",
  FRAME_DARK: "frame",
  GLASS_GROUND: "glassGround",
  GLASS_CLEAR: "glassClear",
  ROOF: "roof",
  BRAND_RED: "red",
  SLAB: "slab",
  CORE_BLACK: "coreBlack",
  STEEL: "steel",
  TILE: "tile",
  CEILING: "ceiling",
  WOOD: "wood",
  FURN_DARK: "furnDark",
  SCREEN: "screen",
  LED_CROWN: "led",
  LIGHT_PANEL: "fixture",
};

/** Materiales translucidos cuya opacidad cambia con el modo datos y el corte de seccion. */
export const GLB_OPACITY_MATERIALS = ["GLASS_CURTAIN", "WHITE_PANEL", "FRAME_DARK", "GLASS_GROUND", "GLASS_CLEAR"] as const;

/** Materiales que NO deben proyectar sombra (translucidos o emisivos planos). */
export const GLB_NO_SHADOW: ReadonlySet<string> = new Set([
  "GLASS_CURTAIN",
  "GLASS_GROUND",
  "GLASS_CLEAR",
  "WINDOW_NIGHT",
  "LIGHT_PANEL",
  "SPC_VOLUME",
]);

/* ------------------------------------------------------------ URLs */

export interface GlbUrls {
  building: string;
  context: string;
}

/** LOD completo en perfil alto y LOD movil en perfil bajo; el contexto es aparte y opcional. */
export function glbUrlsForProfile(profile: "high" | "low", base: { high: string; low: string; context: string }): GlbUrls {
  return { building: profile === "low" ? base.low : base.high, context: base.context };
}

/** En perfil bajo el contexto se reduce al suelo y la calle. */
export function contextMaterialAllowed(profile: "high" | "low", materialName: string): boolean {
  if (profile === "high") return true;
  return materialName === "GROUND" || materialName === "SIDEWALK" || materialName === "ASPHALT";
}
