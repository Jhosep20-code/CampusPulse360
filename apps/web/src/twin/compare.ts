import { presetView, type BoxLike, type Vec3 } from "./view";

/**
 * Logica PURA del comparador "Referencia" (sin React ni DOM): estado, limites de opacidad,
 * encuadre 1:1 y guias. La foto la elige el usuario de forma voluntaria y solo existe como
 * object URL local: nunca se sube ni se guarda en el repositorio.
 */

export type CompareMode = "render" | "photo" | "overlay";
export type GuideMode = "none" | "silhouette" | "thirds";

export interface CompareState {
  /** object URL local de la foto o null. */
  photoUrl: string | null;
  mode: CompareMode;
  /** Opacidad de la foto en superposicion, 0..1. */
  opacity: number;
  guides: GuideMode;
}

export const OPACITY_MIN = 0;
export const OPACITY_MAX = 1;
export const DEFAULT_OVERLAY_OPACITY = 0.5;

export const initialCompareState: CompareState = {
  photoUrl: null,
  mode: "render",
  opacity: DEFAULT_OVERLAY_OPACITY,
  guides: "none",
};

/** Acota la opacidad a [0, 1]; un valor no numerico vuelve al valor por defecto. */
export function clampOpacity(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_OVERLAY_OPACITY;
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, v));
}
export const percentToOpacity = (p: number): number => clampOpacity(p / 100);
export const opacityToPercent = (o: number): number => Math.round(clampOpacity(o) * 100);

export type CompareAction =
  | { type: "load"; url: string }
  | { type: "clear" }
  | { type: "mode"; mode: CompareMode }
  | { type: "opacity"; value: number }
  | { type: "guides"; guides: GuideMode }
  | { type: "reset" };

export function reduceCompare(state: CompareState, action: CompareAction): CompareState {
  switch (action.type) {
    case "load":
      // Al cargar una foto se pasa a superposicion para poder compararla enseguida.
      return { ...state, photoUrl: action.url, mode: "overlay" };
    case "clear":
      return { ...state, photoUrl: null, mode: "render" };
    case "mode":
      // Sin foto solo existe el render.
      return state.photoUrl === null ? { ...state, mode: "render" } : { ...state, mode: action.mode };
    case "opacity":
      return { ...state, opacity: clampOpacity(action.value) };
    case "guides":
      return { ...state, guides: action.guides };
    case "reset":
      return initialCompareState;
  }
}

/** Opacidad efectiva de la capa de foto sobre el render. */
export function photoLayerOpacity(state: CompareState): number {
  if (state.photoUrl === null) return 0;
  if (state.mode === "render") return 0;
  if (state.mode === "photo") return 1;
  return clampOpacity(state.opacity);
}

/** Solo imagenes (el input ya filtra con accept, pero un tipo vacio no debe pasar). */
export function isImageFile(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

export interface UrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface PhotoSlot {
  /** Crea el object URL de la foto y revoca el anterior. */
  set: (file: Blob) => string;
  /** Revoca el URL actual (al salir del modo, quitar la foto o desmontar). */
  release: () => void;
  readonly current: string | null;
}

export function createPhotoSlot(api: UrlApi): PhotoSlot {
  let current: string | null = null;
  const release = () => {
    if (current !== null) api.revokeObjectURL(current);
    current = null;
  };
  return {
    set(file) {
      release();
      current = api.createObjectURL(file);
      return current;
    },
    release,
    get current() {
      return current;
    },
  };
}

/** Cuadro 1:1 centrado dentro de un contenedor (letterbox): el encuadre de comparacion es estable. */
export function letterboxRect(width: number, height: number): { x: number; y: number; size: number } {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const size = Math.min(w, h);
  return { x: (w - size) / 2, y: (h - size) / 2, size };
}

/* ------------------------------------------------------------------ guias */

export type Pt = [number, number];

/** Proyecta un punto de mundo al cuadro 0..1 (x a la derecha, y hacia abajo) con la geometria de view.ts. */
export function projectToFrame(p: Vec3, pos: Vec3, target: Vec3, fovDeg: number, aspect = 1): Pt | null {
  const f = { x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z };
  const fl = Math.hypot(f.x, f.y, f.z) || 1;
  f.x /= fl;
  f.y /= fl;
  f.z /= fl;
  const rl = Math.hypot(f.x, f.z) || 1;
  const r = { x: -f.z / rl, y: 0, z: f.x / rl };
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const d = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  if (depth <= 0.01) return null;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const nx = (d.x * r.x + d.y * r.y + d.z * r.z) / (depth * t * aspect);
  const ny = (d.x * u.x + d.y * u.y + d.z * u.z) / (depth * t);
  return [0.5 + nx / 2, 0.5 - ny / 2];
}

/** Envolvente convexa (cadena monotona de Andrew). */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2] as Pt, h[h.length - 1] as Pt, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

export interface Silhouette {
  /** Contorno aproximado (cuadro 0..1). */
  hull: Pt[];
  /** Arista vertical mas cercana a la camara (union de fachada y lateral). */
  nearEdge: [Pt, Pt] | null;
}

export const REFERENCE_FOV = 35;

/**
 * Silueta de guia: el prisma del edificio proyectado con el encuadre de referencia (1:1).
 * Es una guia ESTIMADA (dimensiones estimadas), no una medicion.
 */
export function referenceSilhouette(box: BoxLike): Silhouette {
  const v = presetView("reference", box, box, { fovDeg: REFERENCE_FOV, aspect: 1 });
  const corners: Vec3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push({ x, y, z });
  const proj = corners.map((c) => ({ c, p: projectToFrame(c, v.position, v.target, REFERENCE_FOV, 1) }));
  const hull = convexHull(proj.flatMap((q) => (q.p ? [q.p] : [])));
  let best: { c: Vec3; d: number } | null = null;
  for (const q of proj) {
    if (q.c.y !== box.min.y) continue;
    const d = Math.hypot(q.c.x - v.position.x, q.c.z - v.position.z);
    if (!best || d < best.d) best = { c: q.c, d };
  }
  let nearEdge: [Pt, Pt] | null = null;
  if (best) {
    const a = projectToFrame(best.c, v.position, v.target, REFERENCE_FOV, 1);
    const b = projectToFrame({ ...best.c, y: box.max.y }, v.position, v.target, REFERENCE_FOV, 1);
    if (a && b) nearEdge = [a, b];
  }
  return { hull, nearEdge };
}
