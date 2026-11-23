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

export const INITIAL_ELEVATION_DEG = 22;
export const INITIAL_AZIMUTH_DEG = 35;
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
