import type { BuildingDims } from "./constants";
import {
  buildEnvironmentBoxes,
  hash01,
  type ContextDensity,
} from "./environment";
import {
  DETAIL_FLOORS,
  addAtriumRailings,
  addCore,
  addDetailedFloor,
  addStairs,
  isDetailed,
  stairSpecs,
  type BoxExtra,
} from "./interior";
import { atriumRect, coreRect, corridorOuterZ, levelBaseY, levelHeight, type TwinLayout } from "./layout";

export { DETAIL_FLOORS };

/**
 * Geometria PROCEDURAL del edificio, agrupada POR MATERIAL para dibujarla con una
 * InstancedMesh por material (docs/referencias/especificacion-3d.md, 5.2-5.8).
 * Todas las medidas son ESTIMACIONES. Funciones puras, sin three ni React; las usan
 * el gemelo (CampusTwin), el presupuesto (budget.ts) y la AR / exportacion GLB (ar/model.ts).
 *
 * Coordenadas de MUNDO en estado compacto: Y arriba, centro de la huella en X/Z,
 * planta baja en y = 0, fachada de vidrio hacia +Z. `level` es la posicion del piso
 * en la pila (0 = planta baja); -1 = elemento fijo del entorno (no se explota).
 */

export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface BBox extends Box {
  /** Indice del piso al que pertenece (explosion y aislamiento); -1 = fijo. */
  level: number;
  /** Giro en Y (rad). */
  ry?: number;
  /** Giro en X (rad), solo tubos inclinados de las escaleras. */
  rx?: number;
  /** Color por instancia (hex), multiplicado por el color del material. */
  color?: string;
}

export type BatchKey =
  | "glass"
  | "white"
  | "frame"
  | "glassGround"
  | "glassClear"
  | "roof"
  | "red"
  | "slab"
  | "led"
  | "coreBlack"
  | "steel"
  | "tile"
  | "ceiling"
  | "fixture"
  | "wood"
  | "furnDark"
  | "screen"
  | "books"
  | "hedge"
  | "sidewalk"
  | "asphalt"
  | "context"
  | "lampHead";

export const BATCH_KEYS: readonly BatchKey[] = [
  "glass",
  "white",
  "frame",
  "glassGround",
  "glassClear",
  "roof",
  "red",
  "slab",
  "led",
  "coreBlack",
  "steel",
  "tile",
  "ceiling",
  "fixture",
  "wood",
  "furnDark",
  "screen",
  "books",
  "hedge",
  "sidewalk",
  "asphalt",
  "context",
  "lampHead",
];

export interface BatchMeta {
  /** Proyecta sombra (solo perfil alto). */
  shadow: boolean;
  /** Solo se dibuja en modo datos o con un piso aislado. */
  interior: boolean;
  /** Un clic aisla el piso (losa y vidrio). */
  pick: boolean;
  /** Pertenece al entorno (no va a la AR/GLB). */
  env: boolean;
  /** Va a la AR / GLB (el mobiliario y las luminarias del interior no). */
  ar: boolean;
  /** Lleva colores por instancia (instanceColor). */
  tinted: boolean;
}

const M = (
  shadow: boolean,
  interior: boolean,
  pick: boolean,
  env: boolean,
  extra: { ar?: boolean; tinted?: boolean } = {},
): BatchMeta => ({
  shadow,
  interior,
  pick,
  env,
  ar: extra.ar ?? !env,
  tinted: extra.tinted ?? false,
});

export const BATCH_META: Record<BatchKey, BatchMeta> = {
  glass: M(false, false, true, false, { tinted: true }),
  white: M(true, false, false, false),
  frame: M(true, false, false, false),
  glassGround: M(false, false, false, false),
  glassClear: M(false, false, false, false),
  roof: M(true, false, false, false),
  red: M(true, false, false, false),
  slab: M(true, false, true, false),
  led: M(false, false, false, false),
  coreBlack: M(false, true, false, false),
  steel: M(false, true, false, false),
  tile: M(false, true, false, false),
  ceiling: M(false, true, false, false, { ar: false }),
  fixture: M(false, true, false, false, { ar: false }),
  wood: M(false, true, false, false, { ar: false }),
  furnDark: M(false, true, false, false, { ar: false }),
  screen: M(false, true, false, false, { ar: false }),
  books: M(false, true, false, false, { ar: false, tinted: true }),
  hedge: M(false, false, false, true),
  sidewalk: M(false, false, false, true),
  asphalt: M(false, false, false, true),
  context: M(true, false, false, true, { tinted: true }),
  lampHead: M(false, false, false, true),
};

/** Panel de ventana encendida (solo visible en modo noche). */
export interface WindowPane {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Giro en Y: 0 mira a +Z, PI a -Z, PI/2 a +X. */
  ry: number;
  /** Piso (indice de pila). */
  level: number;
  /** Espacio instrumentado que enciende la ventana; null = patron estable. */
  spaceId: string | null;
  /** Valor determinista en [0,1). */
  seed: number;
}

export interface Building {
  boxes: Record<BatchKey, BBox[]>;
  windows: WindowPane[];
  levelBase: number[];
  levelHeight: number[];
  /** Cota de la coronacion (sin caja tecnica). */
  crownTop: number;
  /** Cota maxima (caja tecnica incluida). */
  topY: number;
}

function emptyBoxes(): Record<BatchKey, BBox[]> {
  const out = {} as Record<BatchKey, BBox[]>;
  for (const k of BATCH_KEYS) out[k] = [];
  return out;
}

/** Cantidad de franjas de muro cortina (6) x panos (4) = columnas. */
export function curtainColumns(dims: BuildingDims): number {
  return dims.glassBays * dims.panesPerBay;
}

export function buildBuilding(
  dims: BuildingDims,
  layout: TwinLayout,
  density: ContextDensity = "none",
  withEnvironment = true,
): Building {
  const boxes = emptyBoxes();
  const windows: WindowPane[] = [];
  const add = (
    key: BatchKey,
    level: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    extra?: BoxExtra,
  ) => {
    boxes[key].push({ level, x, y, z, sx, sy, sz, ...(extra ?? {}) });
  };

  const n = Math.max(1, layout.floors.length);
  const W = dims.footprintW;
  const D = dims.footprintD;
  const T = dims.wallT;
  const slab = dims.slab;
  const atr = atriumRect(dims);
  const core = coreRect(dims);
  const outerZ = corridorOuterZ(dims);

  // Muro cortina: entre la pilastra izquierda y el borde derecho.
  const cwX0 = -W / 2 + dims.frontPierW;
  const cwX1 = W / 2 - dims.rightEdgeW;
  const cwW = cwX1 - cwX0;
  const cwCx = (cwX0 + cwX1) / 2;
  const cols = curtainColumns(dims);
  const colW = cwW / cols;
  const glassZ = D / 2 - 0.15;

  const levelBase: number[] = [];
  const heights: number[] = [];
  for (let k = 0; k < n; k++) {
    levelBase.push(levelBaseY(k, dims));
    heights.push(levelHeight(k, dims));
  }

  const spacesOf = (k: number) => {
    const level = layout.floors[k]?.level;
    return layout.spaces.filter((s) => s.level === level);
  };

  for (let k = 0; k < n; k++) {
    const base = levelBase[k] ?? 0;
    const H = heights[k] ?? dims.floorHeight;
    const yc = base + H / 2;

    // ---- Losas (con vacio de atrio y de escaleras de P2 en adelante)
    const sw = W - 0.2;
    const sd = D - 0.2;
    const sy = base + slab / 2;
    if (k === 0) {
      add("slab", k, 0, sy, 0, sw, slab, sd);
    } else {
      const x0 = -sw / 2;
      const x1 = sw / 2;
      const z0 = -sd / 2;
      const z1 = sd / 2;
      const holes = stairSpecs(dims).map((s) => ({ x0: s.cx - s.width / 2, x1: s.cx + s.width / 2, z0: s.z0, z1: s.z1 }));
      slabWithHoles(add, k, sy, slab, { x0, x1: atr.minX, z0, z1 }, holes);
      slabWithHoles(add, k, sy, slab, { x0: atr.maxX, x1, z0, z1 }, holes);
      add("slab", k, (atr.minX + atr.maxX) / 2, sy, (atr.maxZ + z1) / 2, atr.maxX - atr.minX, slab, z1 - atr.maxZ);
      add("slab", k, (atr.minX + atr.maxX) / 2, sy, (z0 + atr.minZ) / 2, atr.maxX - atr.minX, slab, atr.minZ - z0);
    }

    // ---- Volumenes macizos blancos: lateral izquierdo ciego, posterior, derecho, pilastra
    add("white", k, -W / 2 + T / 2, yc, -0.2, T, H, D - 1.6);
    add("white", k, 0, yc, -D / 2 + T / 2, W, H, T);
    add("white", k, W / 2 - T / 2, yc, 0.3, T, H, D - 0.6);
    add("white", k, -W / 2 + dims.frontPierW / 2, yc, D / 2 - 0.5, dims.frontPierW, H, 1.0);

    // ---- Fachadas posterior y derecha genericas: banda de ventanas por piso
    const bandY = base + slab + 0.6 + 0.8;
    add("glassGround", k, 0, bandY, -D / 2 - 0.01, W - 6, 1.6, 0.08);
    add("glassGround", k, W / 2 + 0.01, bandY, 0, 0.08, 1.6, D - 8);
    const backN = 8;
    for (let i = 0; i < backN; i++) {
      const bw = (W - 6) / backN;
      windows.push({
        x: -(W - 6) / 2 + (i + 0.5) * bw,
        y: bandY,
        z: -D / 2 - 0.07,
        w: bw - 0.3,
        h: 1.3,
        ry: Math.PI,
        level: k,
        spaceId: spacesOf(k).find((s) => s.row === 1 && Math.abs(s.x - (-(W - 6) / 2 + (i + 0.5) * bw)) < s.w / 2)?.id ?? null,
        seed: hash01(k * 977 + i * 31 + 5),
      });
    }
    const rightN = 6;
    for (let i = 0; i < rightN; i++) {
      const rw = (D - 8) / rightN;
      windows.push({
        x: W / 2 + 0.07,
        y: bandY,
        z: -(D - 8) / 2 + (i + 0.5) * rw,
        w: rw - 0.3,
        h: 1.3,
        ry: Math.PI / 2,
        level: k,
        spaceId: null,
        seed: hash01(k * 613 + i * 47 + 11),
      });
    }

    // ---- Interior: nucleo de ascensores, escaleras, barandas del atrio y pasillos
    const ictx = { dims, add, levelBase, heights, n, spaces: spacesOf(k) };
    addCore(ictx, k);
    if (k < n - 1) addStairs(ictx, k);
    addAtriumRailings(ictx, k);
    const tileY = base + slab + 0.01;
    if (k === 0) {
      add("tile", k, (atr.minX - dims.corridorW + atr.maxX) / 2, tileY, 0, atr.maxX - atr.minX + dims.corridorW, 0.02, 2 * outerZ);
    } else {
      const tx0 = atr.minX - dims.corridorW;
      add("tile", k, (tx0 + atr.maxX) / 2, tileY, (atr.maxZ + outerZ) / 2, atr.maxX - tx0, 0.02, outerZ - atr.maxZ);
      add("tile", k, (tx0 + atr.maxX) / 2, tileY, -(atr.maxZ + outerZ) / 2, atr.maxX - tx0, 0.02, outerZ - atr.maxZ);
      add("tile", k, (tx0 + atr.minX) / 2, tileY, 0, atr.minX - tx0, 0.02, atr.maxZ - atr.minZ);
    }
    // Pasillo que rodea el nucleo por delante y por detras.
    for (const sgn of [1, -1]) {
      add("tile", k, (atr.maxX + core.maxX) / 2, tileY, (sgn * (atr.maxZ + outerZ)) / 2, core.maxX - atr.maxX, 0.02, outerZ - atr.maxZ);
    }
    if (isDetailed(k)) addDetailedFloor(ictx, k);

    // ---- Fachada principal
    if (k === 0) {
      // Planta baja: vidrio oscuro retranqueado, pilastras, banda de rotulo y marquesina.
      const glassH = H - dims.signBandH;
      add("glassGround", k, cwCx, glassH / 2, D / 2 - dims.groundSetback, cwW, glassH, 0.1);
      add("white", k, cwCx, H - dims.signBandH / 2, D / 2 - 0.25, cwW, dims.signBandH, 0.5);
      add("led", k, cwCx, H - dims.signBandH / 2, D / 2 + 0.02, cwW, 0.07, 0.03);
      const ps = dims.pierSize;
      const pierSpan = cwW - ps;
      for (let i = 0; i < dims.groundPiers; i++) {
        const px = cwX0 + ps / 2 + (i * pierSpan) / (dims.groundPiers - 1);
        add("white", k, px, glassH / 2, D / 2 - ps / 2, ps, glassH, ps);
      }
      const mx = dims.atriumX;
      const mw = dims.marqueeW;
      const mt = dims.marqueeT;
      const my = dims.marqueeY;
      const frontZ = D / 2 + dims.marqueeD - 0.3;
      add("white", k, mx, my + mt / 2, D / 2 + dims.marqueeD / 2 - 0.3, mw, mt, dims.marqueeD);
      // Canto de la marquesina: faja frontal y fajas laterales que sobresalen por encima y por debajo de la losa.
      add("white", k, mx, my + mt / 2, frontZ - 0.1, mw, 0.55, 0.2);
      for (const sgn of [-1, 1]) add("white", k, mx + (sgn * (mw - 0.2)) / 2, my + mt / 2, D / 2 + dims.marqueeD / 2 - 0.3, 0.2, 0.55, dims.marqueeD);
      add("led", k, mx, my - 0.06, frontZ - 0.3, mw - 0.6, 0.04, 0.06);
      // Portico: dos columnas y viga bajo la losa.
      for (const sgn of [-1, 1]) add("white", k, mx + sgn * (mw / 2 - 0.45), my / 2, frontZ - 0.55, 0.5, my, 0.5);
      add("white", k, mx, my - 0.25, frontZ - 0.55, mw - 0.9, 0.3, 0.35);
      // Puertas de vidrio del ingreso: 6 hojas con montantes, dintel, umbral y tiradores.
      const doorN = 6;
      const leaf = 1.0;
      const dz = D / 2 - dims.groundSetback + 0.07;
      const dx0 = mx - (doorN * leaf) / 2;
      for (let i = 0; i <= doorN; i++) add("frame", k, dx0 + i * leaf, 1.225, dz, 0.07, 2.45, 0.08);
      add("frame", k, mx, 2.45, dz, doorN * leaf + 0.07, 0.1, 0.1);
      add("frame", k, mx, 0.04, dz, doorN * leaf + 0.07, 0.08, 0.1);
      for (let i = 0; i < doorN; i++) add("glassClear", k, dx0 + (i + 0.5) * leaf, 1.23, dz - 0.01, leaf - 0.08, 2.36, 0.02);
      for (const p of [1, 3, 5]) for (const sgn of [-1, 1]) add("steel", k, dx0 + p * leaf + sgn * 0.12, 1.05, dz + 0.06, 0.03, 0.3, 0.03);
      // Escalon de ingreso (el piso interior esta 0,30 m sobre el lote).
      add("slab", k, mx, 0.075, D / 2 + 0.7, mw - 1, 0.15, 1.6);
      add("slab", k, mx, 0.04, D / 2 + 1.75, mw + 1, 0.08, 0.6);
      // Ventanas del vestibulo (modo noche).
      const lobby = spacesOf(k).find((s) => s.row === 0);
      for (let i = 0; i < 12; i++) {
        windows.push({
          x: cwX0 + ((i + 0.5) * cwW) / 12,
          y: 1.9,
          z: D / 2 - dims.groundSetback + 0.07,
          w: cwW / 12 - 0.4,
          h: 2.8,
          ry: 0,
          level: k,
          spaceId: lobby?.id ?? null,
          seed: hash01(i * 53 + 3),
        });
      }
    } else {
      // Muro cortina: vidrio continuo, junta de losa, montantes principales y secundarios.
      add("glass", k, cwCx, yc, glassZ, cwW, H - 0.1, 0.08, { color: glassTint(k, n) });
      add("frame", k, cwCx, base + 0.05, glassZ + 0.03, cwW, 0.1, 0.25);
      for (let b = 0; b <= dims.glassBays; b++) {
        add("frame", k, cwX0 + (b * cwW) / dims.glassBays, yc, glassZ + 0.05, 0.25, H, 0.35);
      }
      for (let c = 1; c < cols; c++) {
        if (c % dims.panesPerBay === 0) continue;
        add("frame", k, cwX0 + c * colW, yc, glassZ + 0.03, 0.08, H, 0.15);
      }
      const front = spacesOf(k).filter((s) => s.row === 0);
      for (let c = 0; c < cols; c++) {
        const x = cwX0 + (c + 0.5) * colW;
        windows.push({
          x,
          y: base + slab + (H - slab) / 2,
          z: glassZ + 0.1,
          w: colW - 0.12,
          h: H - slab - 0.45,
          ry: 0,
          level: k,
          spaceId: front.find((s) => Math.abs(s.x - x) < s.w / 2)?.id ?? null,
          seed: hash01(k * 1013 + c * 17 + 1),
        });
      }
    }
  }

  // ---- Coronacion, cubierta, caja tecnica, equipos y acento rojo (en el piso superior)
  const top = n - 1;
  const topBase = levelBase[top] ?? 0;
  const roofY = topBase + (heights[top] ?? dims.floorHeight);
  const cH = dims.crownH;
  const cy = roofY + cH / 2;
  add("roof", top, 0, roofY + slab / 2, 0, W - 0.2, slab, D - 0.2);
  add("white", top, 0, cy, D / 2 - T / 2, W, cH, T);
  add("white", top, 0, cy, -D / 2 + T / 2, W, cH, T);
  add("white", top, -W / 2 + T / 2, cy, 0, T, cH, D - 2 * T);
  add("white", top, W / 2 - T / 2, cy, 0, T, cH, D - 2 * T);
  add("red", top, W / 2 - dims.rightEdgeW - cH / 2 - 0.4, cy, D / 2 + 0.03, cH, cH, 0.06);
  // Linea LED blanca de la coronacion (frente y laterales).
  add("led", top, 0, roofY + 0.5, D / 2 + 0.02, W - 1.0, 0.08, 0.04);
  add("led", top, -W / 2 - 0.02, roofY + 0.5, 0, 0.04, 0.08, D - 1.0);
  add("led", top, W / 2 + 0.02, roofY + 0.5, 0, 0.04, 0.08, D - 1.0);
  const roofTop = roofY + slab;
  add("white", top, dims.roofBoxX, roofTop + dims.roofBoxH / 2, dims.roofBoxZ, dims.roofBoxW, dims.roofBoxH, dims.roofBoxD);
  // Equipos de cubierta (volumenes genericos, sin dato real).
  add("roof", top, 7, roofTop + 0.55, -7, 2.6, 1.1, 1.8);
  add("roof", top, 12.5, roofTop + 0.4, -3, 1.8, 0.8, 1.4);
  add("roof", top, -13, roofTop + 0.45, 6, 2.2, 0.9, 1.6);

  if (withEnvironment) {
    const env = buildEnvironmentBoxes(dims.atriumX, density);
    boxes.sidewalk.push(...env.sidewalk);
    boxes.asphalt.push(...env.asphalt);
    boxes.hedge.push(...env.hedge);
    boxes.frame.push(...env.frame);
    boxes.lampHead.push(...env.lampHead);
    boxes.context.push(...env.context);
  }

  const crownTop = roofY + cH;
  return {
    boxes,
    windows,
    levelBase,
    levelHeight: heights,
    crownTop,
    topY: Math.max(crownTop, roofTop + dims.roofBoxH),
  };
}

interface Hole {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Losa rectangular con vacios (escaleras): se parte en franjas X y se resta cada vacio en Z. */
function slabWithHoles(
  add: (key: BatchKey, level: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => void,
  level: number,
  y: number,
  thick: number,
  r: Hole,
  holes: Hole[],
): void {
  const inside = holes.filter((h) => h.x0 >= r.x0 - 1e-9 && h.x1 <= r.x1 + 1e-9);
  const xs = [...new Set([r.x0, r.x1, ...inside.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i] as number;
    const xb = xs[i + 1] as number;
    const cover = inside.filter((h) => h.x0 <= xa + 1e-9 && h.x1 >= xb - 1e-9).sort((a, b) => a.z0 - b.z0);
    let z = r.z0;
    const piece = (za: number, zb: number) => {
      if (zb - za > 1e-6) add("slab", level, (xa + xb) / 2, y, (za + zb) / 2, xb - xa, thick, zb - za);
    };
    for (const h of cover) {
      piece(z, h.z0);
      z = h.z1;
    }
    piece(z, r.z1);
  }
}

/** Multiplicador de color del vidrio por piso: mas claro arriba (refleja mas cielo), con variacion minima. */
export function glassTint(level: number, count: number): string {
  const t = count > 2 ? (level - 1) / (count - 2) : 0;
  const j = (hash01(level * 71 + 3) - 0.5) * 0.06;
  const ch = (a: number, b: number) => Math.max(0, Math.min(1, a + (b - a) * t + j));
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(ch(0.78, 1))}${hex(ch(0.84, 1))}${hex(ch(0.92, 1))}`;
}
