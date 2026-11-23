import type { BuildingDims } from "./constants";
import { hash01 } from "./environment";
import type { BatchKey } from "./facade";
import { atriumRect, coreRect, corridorOuterZ, type SpaceBox } from "./layout";

/**
 * Interior ESQUEMATICO del edificio (docs/referencias/especificacion-3d.md, secciones 1 y 4):
 * atrio con barandas de tubos horizontales, nucleo de 3 ascensores sobre muro negro con
 * puertas de acero, pasillos de porcelanato beige, falso cielo blanco con luminarias
 * cuadradas, puertas de madera clara, escaleras con tramos, descansos y barandas, y
 * mobiliario simple en algunos ambientes.
 *
 * Fuente: fotografias interiores autenticas descritas en la especificacion. NO hay planos:
 * la distribucion es una ESTIMACION y se rotula como tal. El detalle esta en P1-P5 (pisos con
 * espacios instrumentados); P6-P10 llevan solo estructura y barandas simplificadas.
 * Funciones puras sin three ni React.
 */

export interface BoxExtra {
  /** Color por instancia (hex): se multiplica por el color del material. */
  color?: string;
  /** Giro en X (rad), para tubos inclinados. */
  rx?: number;
  /** Giro en Y (rad). */
  ry?: number;
}

export type AddFn = (
  key: BatchKey,
  level: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  extra?: BoxExtra,
) => void;

export interface InteriorCtx {
  dims: BuildingDims;
  add: AddFn;
  /** Origen Y compacto y altura de cada piso (por indice de pila). */
  levelBase: number[];
  heights: number[];
  /** Cantidad de pisos. */
  n: number;
  /** Espacios del piso (coordenadas de edificio, ya con el origen del piso restado). */
  spaces: SpaceBox[];
}

/** Pisos (indices de pila 0..4 = P1..P5) que llevan detalle interior. */
export const DETAIL_FLOORS = 5;
export const isDetailed = (k: number): boolean => k < DETAIL_FLOORS;

/** Mobiliario por espacio (solo los ambientes representativos). */
export type FurnishKind = "classroom" | "lab" | "library";
export const FURNISH: Readonly<Record<string, FurnishKind>> = {
  SPC_1_BIB: "library",
  SPC_2_A202: "classroom",
  SPC_3_LAB1: "lab",
  SPC_4_LAB2: "lab",
};

/** Escalera: centro X, ancho y rango Z (coordenadas de edificio). ESTIMACION. */
export interface StairSpec {
  cx: number;
  width: number;
  z0: number;
  z1: number;
}

export function stairSpecs(dims: BuildingDims): StairSpec[] {
  const core = coreRect(dims);
  const east = (core.maxX + (dims.footprintW / 2 - dims.wallInset)) / 2;
  return [
    { cx: -14.2, width: 3.0, z0: -3, z1: 3 },
    { cx: east, width: 2.0, z0: -3, z1: 3 },
  ];
}

const BOOK_COLORS = ["#C0392B", "#2E86C1", "#E9B824", "#2FA566", "#8E5BB5", "#E67E22", "#ECEFF1", "#16A5A0"];

/* ----------------------------------------------------------------- nucleo */

/** Nucleo de 3 ascensores: muro negro brillante y puertas de acero en cada nivel (frente +Z, hacia el pasillo). */
export function addCore(c: InteriorCtx, k: number): void {
  const { dims, add, levelBase, heights } = c;
  const core = coreRect(dims);
  const base = levelBase[k] ?? 0;
  const H = heights[k] ?? dims.floorHeight;
  const y0 = base + dims.slab;
  const coreH = H - dims.slab;
  add("coreBlack", k, (core.minX + core.maxX) / 2, y0 + coreH / 2, 0, core.maxX - core.minX, coreH, core.maxZ - core.minZ);
  const pitch = (core.maxX - core.minX) / 3;
  for (let i = 0; i < 3; i++) {
    const xc = core.minX + (i + 0.5) * pitch;
    for (const dx of [-0.29, 0.29]) add("steel", k, xc + dx, y0 + 1.1, core.maxZ + 0.025, 0.56, 2.2, 0.05);
    if (isDetailed(k)) add("fixture", k, xc, y0 + 2.42, core.maxZ + 0.02, 0.32, 0.07, 0.03);
  }
}

/* -------------------------------------------------------------- escaleras */

/**
 * Dos escaleras en U con tramos, descanso y barandas inclinadas. Une el piso k con el k+1
 * (el vacio en la losa del piso k+1 lo recorta facade.ts con stairSpecs).
 */
export function addStairs(c: InteriorCtx, k: number): void {
  const { dims, add, levelBase, heights } = c;
  const base = levelBase[k] ?? 0;
  const H = heights[k] ?? dims.floorHeight;
  const y0 = base + dims.slab;
  const half = H / 2;
  const steps = isDetailed(k) ? Math.max(6, Math.round(half / 0.19)) : 5;
  const riser = half / steps;
  const landing = 1.6;
  const gap = 0.08;
  for (const s of stairSpecs(dims)) {
    const runLen = s.z1 - s.z0 - landing;
    const run = runLen / steps;
    const laneW = (s.width - gap) / 2;
    const cA = s.cx - (laneW + gap) / 2;
    const cB = s.cx + (laneW + gap) / 2;
    for (let j = 1; j <= steps; j++) {
      const h1 = j * riser;
      add("slab", k, cA, y0 + h1 / 2, s.z0 + (j - 0.5) * run, laneW, h1, run);
      const h2 = half + j * riser;
      add("slab", k, cB, y0 + h2 / 2, s.z0 + runLen - (j - 0.5) * run, laneW, h2, run);
    }
    add("slab", k, s.cx, y0 + half - 0.1, s.z1 - landing / 2, s.width, 0.2, landing);

    // Barandas: tubos inclinados siguiendo cada tramo (exterior e interior) y baranda del descanso.
    const len = Math.hypot(runLen, half);
    const theta = Math.atan2(half, runLen);
    const zMid = s.z0 + runLen / 2;
    const ry1 = y0 + 0.9 + half / 2;
    const ry2 = y0 + half + 0.9 + half / 2;
    add("steel", k, cA - laneW / 2, ry1, zMid, 0.04, 0.04, len, { rx: -theta });
    add("steel", k, cA + laneW / 2, ry1, zMid, 0.04, 0.04, len, { rx: -theta });
    add("steel", k, cB - laneW / 2, ry2, zMid, 0.04, 0.04, len, { rx: theta });
    add("steel", k, cB + laneW / 2, ry2, zMid, 0.04, 0.04, len, { rx: theta });
    add("steel", k, s.cx, y0 + half + 0.9, s.z1 - 0.04, s.width, 0.04, 0.04);
  }
}

/* ----------------------------------------------------- barandas del atrio */

/** Barandas de acero de tubos horizontales en cada borde de losa del atrio (el borde este es el nucleo). */
export function addAtriumRailings(c: InteriorCtx, k: number): void {
  const { dims, add, levelBase } = c;
  if (k === 0) return;
  const atr = atriumRect(dims);
  const base = levelBase[k] ?? 0;
  const y0 = base + dims.slab;
  const rw = atr.maxX - atr.minX;
  const rd = atr.maxZ - atr.minZ;
  const cx = (atr.minX + atr.maxX) / 2;
  const detailed = isDetailed(k);
  const rows = detailed ? [0.35, 0.7, 1.05] : [0.55, 1.05];
  for (const dy of rows) {
    add("steel", k, cx, y0 + dy, atr.maxZ - 0.06, rw, 0.045, 0.045);
    add("steel", k, cx, y0 + dy, atr.minZ + 0.06, rw, 0.045, 0.045);
    add("steel", k, atr.minX + 0.06, y0 + dy, 0, 0.045, 0.045, rd);
  }
  // Pasamanos superior algo mas grueso en los pisos con detalle.
  if (detailed) {
    add("steel", k, cx, y0 + 1.1, atr.maxZ - 0.06, rw, 0.07, 0.07);
    add("steel", k, cx, y0 + 1.1, atr.minZ + 0.06, rw, 0.07, 0.07);
    add("steel", k, atr.minX + 0.06, y0 + 1.1, 0, 0.07, 0.07, rd);
  }
  const postsX = Math.round(rw / (detailed ? 2 : 3.5));
  for (let i = 0; i <= postsX; i++) {
    const px = atr.minX + 0.06 + (i * (rw - 0.12)) / postsX;
    add("steel", k, px, y0 + 0.525, atr.maxZ - 0.06, 0.05, 1.05, 0.05);
    add("steel", k, px, y0 + 0.525, atr.minZ + 0.06, 0.05, 1.05, 0.05);
  }
  const postsZ = detailed ? 4 : 2;
  for (let i = 1; i < postsZ; i++) {
    add("steel", k, atr.minX + 0.06, y0 + 0.525, atr.minZ + (i * rd) / postsZ, 0.05, 1.05, 0.05);
  }
}

/* -------------------------------------------- ambientes, cielo, luces, puertas */

/** Piso, falso cielo con luminarias, tabiques con puertas de madera y mobiliario (solo P1-P5). */
export function addDetailedFloor(c: InteriorCtx, k: number): void {
  const { dims, add, levelBase, heights } = c;
  const atr = atriumRect(dims);
  const core = coreRect(dims);
  const outerZ = corridorOuterZ(dims);
  const base = levelBase[k] ?? 0;
  const H = heights[k] ?? dims.floorHeight;
  const y0 = base + dims.slab;
  const ceilY = base + H - dims.headroom;
  const tx0 = atr.minX - dims.corridorW;

  const ceiling = (x0: number, x1: number, z0: number, z1: number) =>
    add("ceiling", k, (x0 + x1) / 2, ceilY + 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0);
  const light = (x: number, z: number) => add("fixture", k, x, ceilY - 0.015, z, 0.6, 0.03, 0.6);

  // Falso cielo sobre los pasillos perimetrales (el vacio del atrio queda abierto).
  ceiling(tx0, core.maxX, atr.maxZ, outerZ);
  ceiling(tx0, core.maxX, -outerZ, atr.minZ);
  ceiling(tx0, atr.minX, atr.minZ, atr.maxZ);

  // Luminarias cuadradas de los pasillos (emisivas, instanciadas).
  for (let x = tx0 + 0.9; x < core.maxX - 0.3; x += 3) {
    light(x, (atr.maxZ + outerZ) / 2);
    light(x, -(atr.maxZ + outerZ) / 2);
  }
  for (const z of [-3, 0, 3]) light((tx0 + atr.minX) / 2, z);

  // Ambientes: piso, falso cielo, luces, tabique con puertas y mobiliario.
  for (const s of c.spaces) {
    const x0 = s.x - s.w / 2;
    const x1 = s.x + s.w / 2;
    const z0 = s.z - s.d / 2;
    const z1 = s.z + s.d / 2;
    add("tile", k, s.x, y0 + 0.01, s.z, s.w, 0.02, s.d);
    ceiling(x0, x1, z0, z1);
    const nx = Math.max(1, Math.floor(s.w / 4));
    const rowsZ = s.row === 1 ? [s.z - s.d / 4, s.z + s.d / 4] : [s.z];
    for (let i = 0; i < nx; i++) for (const z of rowsZ) light(x0 + ((i + 0.5) * s.w) / nx, z);

    // Tabique del lado del pasillo: puertas de madera clara; las aulas del fondo llevan vidrio (se ven por dentro).
    const wz = s.row === 0 ? z0 - 0.05 : z1 + 0.05;
    const nDoors = Math.max(1, Math.round(s.w / 7.5));
    const doorW = 0.95;
    const wallTop = ceilY - y0;
    let cursor = x0;
    for (let i = 0; i < nDoors; i++) {
      const xd = x0 + ((i + 0.5) * s.w) / nDoors;
      const a = xd - doorW / 2;
      if (a - cursor > 0.05) partition(c, k, s.row === 1, (cursor + a) / 2, a - cursor, wz, y0);
      add("wood", k, xd, y0 + 1.1, wz, doorW, 2.2, 0.06);
      add("steel", k, xd + 0.32, y0 + 1.0, wz + (s.row === 1 ? 0.045 : -0.045), 0.03, 0.14, 0.03);
      cursor = xd + doorW / 2;
    }
    if (x1 - cursor > 0.05) partition(c, k, s.row === 1, (cursor + x1) / 2, x1 - cursor, wz, y0);
    add("white", k, s.x, y0 + 2.3 + (wallTop - 2.3) / 2, wz, s.w, wallTop - 2.3, 0.1);

    const kind = FURNISH[s.id];
    if (kind) furnish(c, k, s, kind, y0);
  }
}

/** Tramo de tabique entre puertas: aula del fondo = antepecho blanco + vidrio; frente = muro blanco. */
function partition(c: InteriorCtx, k: number, glazed: boolean, x: number, len: number, z: number, y0: number): void {
  if (glazed) {
    c.add("white", k, x, y0 + 0.45, z, len, 0.9, 0.1);
    c.add("glassClear", k, x, y0 + 1.6, z, len, 1.4, 0.04);
  } else {
    c.add("white", k, x, y0 + 1.15, z, len, 2.3, 0.1);
  }
}

/* -------------------------------------------------------------- mobiliario */

function furnish(c: InteriorCtx, k: number, s: SpaceBox, kind: FurnishKind, y0: number): void {
  const { add } = c;
  // Muro de la pizarra (el mas alejado del pasillo) y sentido hacia el pasillo.
  const wallZ = s.row === 1 ? s.z - s.d / 2 : s.z + s.d / 2;
  const dir = s.row === 1 ? 1 : -1;
  const floor = y0 + 0.02;
  const x0 = s.x - s.w / 2;

  // Pizarras blancas sobre el muro (en el aula y el laboratorio).
  if (kind !== "library") {
    const nb = Math.max(1, Math.floor(s.w / 9));
    for (let i = 0; i < nb; i++) {
      add("ceiling", k, x0 + ((i + 0.5) * s.w) / nb, floor + 1.6, wallZ + dir * 0.04, 3.2, 1.2, 0.04);
    }
  }

  if (kind === "classroom") {
    // Filas de carpetas negras con tablero blanco, de cara a la pizarra.
    const cols = Math.max(1, Math.floor((s.w - 3) / 3) + 1);
    const x00 = s.x - ((cols - 1) * 3) / 2;
    for (let r = 0; r < 4; r++) {
      const z = wallZ + dir * (1.9 + r * 1.25);
      for (let i = 0; i < cols; i++) {
        const x = x00 + i * 3;
        add("furnDark", k, x, floor + 0.45, z - dir * 0.2, 2.3, 0.5, 0.03);
        add("ceiling", k, x, floor + 0.75, z, 2.4, 0.04, 0.5);
      }
    }
  } else if (kind === "lab") {
    // Mesas largas con monitores en fila.
    const segs = Math.max(1, Math.floor((s.w - 2) / 3.4));
    const x00 = s.x - ((segs - 1) * 3.4) / 2;
    for (let r = 0; r < 2; r++) {
      const z = wallZ + dir * (2.6 + r * 3.0);
      for (let i = 0; i < segs; i++) {
        const x = x00 + i * 3.4;
        add("ceiling", k, x, floor + 0.74, z, 2.9, 0.05, 0.8);
        add("furnDark", k, x, floor + 0.38, z - dir * 0.34, 2.8, 0.72, 0.04);
        for (const dx of [-0.75, 0.75]) {
          add("furnDark", k, x + dx, floor + 0.99, z - dir * 0.1, 0.58, 0.36, 0.03);
          add("screen", k, x + dx, floor + 0.99, z - dir * 0.1 + dir * 0.02, 0.52, 0.3, 0.012);
        }
      }
    }
  } else {
    // Biblioteca: estanterias de madera con lomos de colores hacia el pasillo.
    const units = Math.max(1, Math.floor((s.w - 2) / 2.7));
    const x00 = s.x - ((units - 1) * 2.7) / 2;
    for (let r = 0; r < 3; r++) {
      const z = wallZ + dir * (1.8 + r * 2.2);
      for (let i = 0; i < units; i++) {
        const x = x00 + i * 2.7;
        add("wood", k, x, floor + 1.0, z, 2.3, 2.0, 0.45);
        for (let b = 0; b < 3; b++) {
          const col = BOOK_COLORS[Math.floor(hash01(k * 1301 + r * 211 + i * 17 + b * 5) * BOOK_COLORS.length)] ?? "#ECEFF1";
          add("books", k, x, floor + 0.5 + b * 0.5, z + dir * 0.255, 2.15, 0.28, 0.07, { color: col });
        }
      }
    }
  }
}
