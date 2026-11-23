/**
 * Vista inicial de la camara del gemelo. Funcion PURA (sin three ni React) para
 * poder probarla sin WebGL.
 *
 * Dado un cuadro delimitador, la geometria de la camara (fov vertical y aspecto)
 * y los angulos de observacion, devuelve la posicion y el objetivo de modo que
 * las 8 esquinas de la caja queden dentro del frustum con un margen.
 * Ejes del gemelo: Y arriba; la fachada principal mira a +Z.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoxLike {
  min: Vec3;
  max: Vec3;
}

export interface InitialViewOptions {
  /** Campo de vision VERTICAL en grados. */
  fovDeg: number;
  /** Ancho / alto del lienzo. */
  aspect: number;
  /** Elevacion sobre el horizonte, en grados. */
  elevationDeg?: number;
  /** Azimut desde la fachada principal (+Z) hacia +X, en grados. */
  azimuthDeg?: number;
  /** Factor > 1 de holgura alrededor del edificio (1,12 = 12 %). */
  margin?: number;
}

export interface InitialView {
  position: Vec3;
  target: Vec3;
  distance: number;
}

/** Camara por defecto (especificacion 5.7): azimut -30 grados y elevacion 14 grados. */
export const INITIAL_ELEVATION_DEG = 14;
export const INITIAL_AZIMUTH_DEG = -30;
export const INITIAL_MARGIN = 1.12;

const RAD = Math.PI / 180;

export function boxCorners(box: BoxLike): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) out.push({ x, y, z });
  return out;
}

export function initialViewFromBox(box: BoxLike, opts: InitialViewOptions): InitialView {
  const elevation = (opts.elevationDeg ?? INITIAL_ELEVATION_DEG) * RAD;
  const azimuth = (opts.azimuthDeg ?? INITIAL_AZIMUTH_DEG) * RAD;
  const margin = Math.max(1, opts.margin ?? INITIAL_MARGIN);
  const aspect = Number.isFinite(opts.aspect) && opts.aspect > 0.05 ? opts.aspect : 1;

  const target: Vec3 = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };

  // Direccion objetivo -> camara.
  const dir: Vec3 = {
    x: Math.sin(azimuth) * Math.cos(elevation),
    y: Math.sin(elevation),
    z: Math.cos(azimuth) * Math.cos(elevation),
  };
  // Base de la camara: forward = -dir, right = forward x up, camUp = right x forward.
  const fwd: Vec3 = { x: -dir.x, y: -dir.y, z: -dir.z };
  const rl = Math.hypot(fwd.z, fwd.x) || 1;
  const right: Vec3 = { x: -fwd.z / rl, y: 0, z: fwd.x / rl };
  const up: Vec3 = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };

  const tanV = Math.tan((opts.fovDeg * RAD) / 2);
  const tanH = tanV * aspect;
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

  let dist = 0;
  for (const c of boxCorners(box)) {
    const q: Vec3 = { x: c.x - target.x, y: c.y - target.y, z: c.z - target.z };
    // Profundidad de la esquina = dist + a (a > 0: mas lejos que el objetivo).
    const a = dot(q, fwd);
    dist = Math.max(dist, (margin * Math.abs(dot(q, right))) / tanH - a, (margin * Math.abs(dot(q, up))) / tanV - a);
  }
  // Nunca dentro de la caja.
  const half = Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2;
  dist = Math.max(dist, half * 0.6, 1);

  return {
    position: { x: target.x + dir.x * dist, y: target.y + dir.y * dist, z: target.z + dir.z * dist },
    target,
    distance: dist,
  };
}

/* ------------------------------------------------------------------ presets */

export type TwinPresetId = "facade" | "aerial" | "atrium" | "reference";

export interface TwinPreset {
  id: TwinPresetId;
  label: string;
  /** Descripcion para el nombre accesible del boton. */
  description: string;
  azimuthDeg: number;
  elevationDeg: number;
  margin: number;
  /** Distancia fija en metros (encuadre de referencia). */
  distance?: number;
  /** Cota Y del objetivo si la distancia es fija. */
  targetY?: number;
}

export const TWIN_PRESETS: readonly TwinPreset[] = [
  { id: "facade", label: "Fachada", description: "Vista de la fachada principal", azimuthDeg: -30, elevationDeg: 14, margin: INITIAL_MARGIN },
  { id: "aerial", label: "Aérea", description: "Vista aérea del edificio y su entorno", azimuthDeg: -38, elevationDeg: 42, margin: 1.45 },
  // Atrio: corte de seccion visto de frente y algo elevado; encuadra atrio, ascensores y 4 niveles.
  { id: "atrium", label: "Atrio", description: "Corte de seccion: atrio, nucleo de ascensores e interior esquematico", azimuthDeg: -12, elevationDeg: 11, margin: 1.06 },
  // Encuadre de referencia (especificacion 5.7): azimut -30, elevacion 13, ~90 m, lienzo 1:1.
  { id: "reference", label: "Referencia", description: "Encuadre de referencia 1:1 para comparar con una fotografia propia", azimuthDeg: -30, elevationDeg: 13, margin: 1, distance: 90, targetY: 18.5 },
];

export function presetById(id: TwinPresetId): TwinPreset {
  return TWIN_PRESETS.find((p) => p.id === id) ?? (TWIN_PRESETS[0] as TwinPreset);
}

/**
 * Vista de un preset sobre la caja del edificio. El preset "atrium" encuadra el
 * vacio del atrio y el nucleo (atriumBox); los demas usan la caja del edificio.
 */
export function presetView(
  id: TwinPresetId,
  buildingBox: BoxLike,
  atriumBox: BoxLike,
  opts: { fovDeg: number; aspect: number },
): InitialView {
  const p = presetById(id);
  if (p.distance !== undefined) {
    const az = p.azimuthDeg * RAD;
    const el = p.elevationDeg * RAD;
    const target: Vec3 = {
      x: (buildingBox.min.x + buildingBox.max.x) / 2,
      y: p.targetY ?? (buildingBox.min.y + buildingBox.max.y) / 2,
      z: (buildingBox.min.z + buildingBox.max.z) / 2,
    };
    const d = p.distance;
    return {
      position: {
        x: target.x + Math.sin(az) * Math.cos(el) * d,
        y: target.y + Math.sin(el) * d,
        z: target.z + Math.cos(az) * Math.cos(el) * d,
      },
      target,
      distance: d,
    };
  }
  return initialViewFromBox(id === "atrium" ? atriumBox : buildingBox, {
    ...opts,
    azimuthDeg: p.azimuthDeg,
    elevationDeg: p.elevationDeg,
    margin: p.margin,
  });
}

/** Enfoque de un piso aislado: vista elevada para ver su interior. */
export function floorFocusView(floorBox: BoxLike, opts: { fovDeg: number; aspect: number }): InitialView {
  return initialViewFromBox(floorBox, { ...opts, azimuthDeg: -25, elevationDeg: 38, margin: 1.12 });
}

/** Limites de orbita y zoom: la camara nunca queda bajo el suelo (el objetivo se acota a y >= 0). */
export const CAMERA_LIMITS = {
  minDistance: 10,
  maxDistance: 230,
  minPolarAngle: 0.1,
  maxPolarAngle: Math.PI / 2 - 0.04,
  /** Margen horizontal del recinto de panoramica alrededor del edificio (m). */
  panMargin: 40,
} as const;

/** Altura minima de la camara sobre el suelo dada una elevacion maxima de orbita. */
export function minCameraHeight(targetY: number, distance: number, polarAngle: number): number {
  return Math.max(0, targetY) + distance * Math.cos(Math.min(polarAngle, CAMERA_LIMITS.maxPolarAngle));
}
