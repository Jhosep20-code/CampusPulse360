import type { Rect } from "./layout";

/*
 * Recorrido en primera persona (FPS) dentro del modelo de Blender existente. No anade geometria: las colisiones son
 * rectangulos en planta con las MISMAS medidas con las que assets/3d/blender/build_utp_huancayo.py construye el GLB
 * (constantes W, DP, ATR_*, CORE_*, CORR, STAIR_*, FRONT_Z/BACK_Z y build_rooms). Si el script cambia, actualizar PLAN.
 * Obstaculos: muros exteriores, vacio del atrio (desde P2), escaleras, nucleo de ascensores, zonas sin pasillo junto
 * al nucleo y al oeste, y el tabique de cada ambiente hacia el pasillo, con sus 5 puertas como unico paso.
 * El mobiliario no colisiona (simplificacion declarada). Medidas ESTIMADAS, sin planos, como el resto del gemelo.
 */

/** Medidas en planta del GLB (m). Fuente: build_utp_huancayo.py. */
export const PLAN = {
  W: 38,
  DP: 30,
  wallInset: 0.8,
  frontSetback: 1.8,
  groundSetback: 1.5,
  corridor: 2.4,
  atrium: { minX: -4, maxX: 8, minZ: -4.5, maxZ: 4.5 },
  core: { minX: 10.4, maxX: 16.4, minZ: -4.5, maxZ: 4.5 },
  /** Borde este de los tramos de escalera (STAIR_X1); arrancan en el borde oeste del vacio. */
  stairX1: -0.78,
  /** Tabique de los ambientes hacia el pasillo (wz = +-(OUTER_Z + 0,05)) y ancho de puerta. */
  partitionZ: 6.95,
  doorW: 0.95,
  doors: 5,
} as const;

/** Altura de los ojos sobre el piso terminado (m): adulto de ~1,75 m. */
export const EYE_HEIGHT = 1.65;
/** Radio del "cuerpo" para colisiones (m). */
export const BODY_RADIUS = 0.3;
/** Velocidad al caminar y al correr (m/s). */
export const WALK_SPEED = 2.6;
export const RUN_SPEED = 5.2;
/** Limite de inclinacion vertical de la mirada (rad). */
export const MAX_PITCH = 1.3;

export interface WalkArea {
  /** Limites interiores de la planta (centro del cuerpo). */
  bounds: Rect;
  /** Obstaculos ya ampliados por el radio del cuerpo. */
  blocks: Rect[];
}

const grow = (r: Rect, d: number): Rect => ({ minX: r.minX - d, maxX: r.maxX + d, minZ: r.minZ - d, maxZ: r.maxZ + d });
const inside = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;

/** Centros X de las puertas del tabique (misma formula que build_rooms: n puertas repartidas en el ancho util). */
export function doorCenters(): number[] {
  const x0 = -PLAN.W / 2 + PLAN.wallInset;
  const sx = PLAN.W - 2 * PLAN.wallInset;
  return Array.from({ length: PLAN.doors }, (_, i) => x0 + ((i + 0.5) * sx) / PLAN.doors);
}

/** Tramos macizos del tabique (entre puertas) a la cota z, ampliados por el radio solo en Z para que la puerta entera sea paso. */
function partitionBlocks(z: number, r: number): Rect[] {
  const x0 = -PLAN.W / 2;
  const x1 = PLAN.W / 2;
  const out: Rect[] = [];
  let cursor = x0;
  for (const xd of doorCenters()) {
    out.push({ minX: cursor, maxX: xd - PLAN.doorW / 2, minZ: z - 0.05 - r, maxZ: z + 0.05 + r });
    cursor = xd + PLAN.doorW / 2;
  }
  out.push({ minX: cursor, maxX: x1, minZ: z - 0.05 - r, maxZ: z + 0.05 + r });
  return out;
}

/** Zona caminable del piso con indice `index` en la pila (0 = planta baja). */
export function walkArea(index: number): WalkArea {
  const r = BODY_RADIUS;
  const P = PLAN;
  const outerZ = P.atrium.maxZ + P.corridor; // 6,9: borde exterior del pasillo
  const westX = P.atrium.minX - P.corridor; // -6,4: fin del pasillo oeste
  const front = index === 0 ? P.DP / 2 - P.groundSetback : P.DP / 2 - P.frontSetback;
  const bounds: Rect = {
    minX: -P.W / 2 + P.wallInset + r,
    maxX: P.W / 2 - P.wallInset - r,
    minZ: -P.DP / 2 + P.wallInset + r,
    maxZ: front - r,
  };
  const blocks: Rect[] = [
    grow(P.core, r),
    // Sin pasillo al este del nucleo ni al oeste del pasillo oeste (en el modelo no hay piso alli).
    grow({ minX: P.core.maxX, maxX: P.W / 2, minZ: -outerZ, maxZ: outerZ }, r),
    grow({ minX: -P.W / 2, maxX: westX, minZ: -outerZ, maxZ: outerZ }, r),
    ...partitionBlocks(P.partitionZ, r),
    ...partitionBlocks(-P.partitionZ, r),
  ];
  // Planta baja: el atrio es suelo, salvo los tramos de escalera (borde oeste). Desde P2: vacio con baranda.
  blocks.push(grow(index === 0 ? { ...P.atrium, maxX: P.stairX1 } : P.atrium, r));
  return { bounds, blocks };
}

export function canStand(area: WalkArea, x: number, z: number): boolean {
  const b = area.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return !area.blocks.some((r) => inside(r, x, z));
}

/**
 * Mueve (x, z) por (dx, dz) con deslizamiento: se intenta cada eje por separado, asi el cuerpo resbala por los
 * muros en lugar de detenerse en seco. Pasos grandes se subdividen para no "saltar" obstaculos delgados.
 */
export function moveWithCollisions(area: WalkArea, x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.05));
  let px = x;
  let pz = z;
  for (let i = 0; i < n; i++) {
    const sx = dx / n;
    const sz = dz / n;
    if (canStand(area, px + sx, pz)) px += sx;
    if (canStand(area, px, pz + sz)) pz += sz;
  }
  return { x: px, z: pz };
}

/**
 * Punto de aparicion (yaw 0 = mirando a -Z, hacia el atrio):
 * - planta baja: dentro del hall, frente a la puerta central del tabique;
 * - pisos altos: pasillo frontal, ante la baranda del atrio.
 */
export function spawnPoint(index: number): { x: number; z: number; yaw: number } {
  const area = walkArea(index);
  const door = doorCenters()[Math.floor(PLAN.doors / 2)] ?? 0;
  const z = index === 0 ? area.bounds.maxZ - 1.5 : (PLAN.atrium.maxZ + PLAN.partitionZ) / 2;
  if (canStand(area, door, z)) return { x: door, z, yaw: 0 };
  for (let gz = area.bounds.maxZ; gz > area.bounds.minZ; gz -= 0.5) {
    for (let gx = area.bounds.minX; gx < area.bounds.maxX; gx += 0.5) if (canStand(area, gx, gz)) return { x: gx, z: gz, yaw: 0 };
  }
  return { x: 0, z: 0, yaw: 0 };
}

/** Direccion de avance y lateral en planta para un yaw dado (yaw 0 = -Z). */
export function planarAxes(yaw: number): { fx: number; fz: number; rx: number; rz: number } {
  return { fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) };
}
