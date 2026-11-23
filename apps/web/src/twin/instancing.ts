/**
 * Transformación de cada instancia del edificio según la visibilidad de su piso y la
 * explosión (función pura y testeable).
 *
 * Causa raíz de las "losas negras" (23-nov-2026): al ocultar un piso se ponía escala
 * Y = 0 conservando X y Z. Cada caja quedaba como un plano horizontal de tamaño
 * completo sobre la base del piso. Además, el shader de instancing de three divide la
 * normal por la escala al cuadrado de cada eje (defaultnormal_vertex:
 * transformedNormal /= dot(im[1], im[1])); con escala Y = 0 la normal se vuelve
 * Inf/NaN y el plano se ilumina NEGRO. Una pila de planos negros, uno por piso oculto,
 * que además proyectaban sombra y recibían el raycast.
 *
 * Regla corregida:
 *  - Piso oculto (v ≈ 0): matriz NULA (escala 0 en los tres ejes). Los triángulos
 *    degeneran a área 0 y no se rasteriza nada: ni color, ni sombra, ni raycast.
 *  - Transición (0 < v < 1): aplastamiento hacia la base, con escala Y mínima del 5 %
 *    para que la normal sea finita, sin planos negros durante la animación.
 */
export const HIDDEN_EPS = 0.003;
export const MIN_SQUASH = 0.05;

export interface InstanceInput {
  level: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface InstanceTransform {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  hidden: boolean;
}

/**
 * @param vis visibilidad del piso de la instancia (0 oculto … 1 visible); se ignora si level < 0.
 * @param explT avance de la explosión (0 … 1).
 * @param levelBase cota de la base del piso.
 * @param gap separación extra por piso al explotar.
 */
export function instanceTransform(b: InstanceInput, vis: number, explT: number, levelBase: number, gap: number): InstanceTransform {
  if (b.level < 0) return { x: b.x, y: b.y, z: b.z, sx: b.sx, sy: b.sy, sz: b.sz, hidden: false };
  if (vis < HIDDEN_EPS) return { x: b.x, y: levelBase, z: b.z, sx: 0, sy: 0, sz: 0, hidden: true };
  const v = Math.min(1, vis);
  const y = levelBase + (b.y - levelBase) * v + b.level * gap * explT;
  return { x: b.x, y, z: b.z, sx: b.sx, sy: b.sy * Math.max(v, MIN_SQUASH), sz: b.sz, hidden: false };
}

/**
 * Comprueba que la normal transformada por el shader de instancing de three sea finita
 * (réplica en JS de defaultnormal_vertex para una matriz sin rotación).
 */
export function instancedNormalIsFinite(t: InstanceTransform): boolean {
  if (t.hidden) return true; // no se rasteriza
  const n = [0, 1, 0]; // normal de la cara superior
  const s = [t.sx, t.sy, t.sz];
  const v = n.map((c, i) => (c / (s[i]! * s[i]!)) * s[i]!);
  const len = Math.hypot(...v);
  return Number.isFinite(len) && len > 0;
}
