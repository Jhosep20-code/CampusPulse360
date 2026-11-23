import type { BuildingDims } from "./constants";
import {
  buildEnvironmentBoxes,
  hash01,
  type ContextDensity,
} from "./environment";
import { atriumRect, coreRect, corridorOuterZ, levelBaseY, levelHeight, type TwinLayout } from "./layout";

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
}

export type BatchKey =
  | "glass"
  | "white"
  | "frame"
  | "glassGround"
  | "roof"
  | "red"
  | "slab"
  | "led"
  | "coreBlack"
  | "steel"
  | "tile"
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
  "roof",
  "red",
  "slab",
  "led",
  "coreBlack",
  "steel",
  "tile",
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
}

const M = (shadow: boolean, interior: boolean, pick: boolean, env: boolean): BatchMeta => ({
  shadow,
  interior,
  pick,
  env,
});

export const BATCH_META: Record<BatchKey, BatchMeta> = {
  glass: M(false, false, true, false),
  white: M(true, false, false, false),
  frame: M(true, false, false, false),
  glassGround: M(false, false, false, false),
  roof: M(true, false, false, false),
  red: M(true, false, false, false),
  slab: M(true, false, true, false),
  led: M(false, false, false, false),
  coreBlack: M(false, true, false, false),
  steel: M(false, true, false, false),
  tile: M(false, true, false, false),
  hedge: M(false, false, false, true),
  sidewalk: M(false, false, false, true),
  asphalt: M(false, false, false, true),
  context: M(true, false, false, true),
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
  const add = (key: BatchKey, level: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    boxes[key].push({ level, x, y, z, sx, sy, sz });
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

    // ---- Losas (con vacio de atrio de P2 en adelante)
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
      add("slab", k, (x0 + atr.minX) / 2, sy, 0, atr.minX - x0, slab, sd);
      add("slab", k, (atr.maxX + x1) / 2, sy, 0, x1 - atr.maxX, slab, sd);
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

    // ---- Nucleo de 3 ascensores sobre muro negro brillante (cara hacia el atrio)
    const coreH = H - slab;
    add("coreBlack", k, (core.minX + core.maxX) / 2, base + slab + coreH / 2, 0, core.maxX - core.minX, coreH, core.maxZ - core.minZ);
    for (const dz of [-2.4, 0, 2.4]) add("steel", k, core.minX - 0.03, base + slab + 1.2, dz, 0.06, 2.4, 1.6);

    // ---- Dos escaleras (volumen de tramo + descanso)
    for (const sx of [-14.2, (core.maxX + (W / 2 - dims.wallInset)) / 2]) {
      const wide = sx < 0 ? 3.0 : 1.8;
      add("steel", k, sx, base + slab + coreH * 0.25, -0.5, wide, coreH * 0.5, 5);
      add("steel", k, sx, base + slab + coreH * 0.5 - 0.06, 3.0, wide, 0.12, 1.4);
    }

    // ---- Pasillo perimetral (porcelanato) y barandas de acero del atrio
    const tileY = base + slab + 0.01;
    if (k === 0) {
      add("tile", k, (atr.minX - dims.corridorW + atr.maxX) / 2, tileY, 0, atr.maxX - atr.minX + dims.corridorW, 0.02, 2 * outerZ);
    } else {
      const tx0 = atr.minX - dims.corridorW;
      add("tile", k, (tx0 + atr.maxX) / 2, tileY, (atr.maxZ + outerZ) / 2, atr.maxX - tx0, 0.02, outerZ - atr.maxZ);
      add("tile", k, (tx0 + atr.maxX) / 2, tileY, -(atr.maxZ + outerZ) / 2, atr.maxX - tx0, 0.02, outerZ - atr.maxZ);
      add("tile", k, (tx0 + atr.minX) / 2, tileY, 0, atr.minX - tx0, 0.02, atr.maxZ - atr.minZ);

      const rw = atr.maxX - atr.minX;
      const rd = atr.maxZ - atr.minZ;
      const cx = (atr.minX + atr.maxX) / 2;
      for (const dy of [1.05, 0.55]) {
        add("steel", k, cx, base + slab + dy, atr.maxZ - 0.06, rw, 0.05, 0.05);
        add("steel", k, cx, base + slab + dy, atr.minZ + 0.06, rw, 0.05, 0.05);
        add("steel", k, atr.minX + 0.06, base + slab + dy, 0, 0.05, 0.05, rd);
      }
      const postsX = Math.round(rw / 2);
      for (let i = 0; i <= postsX; i++) {
        const px = atr.minX + 0.06 + (i * (rw - 0.12)) / postsX;
        add("steel", k, px, base + slab + 0.525, atr.maxZ - 0.06, 0.05, 1.05, 0.05);
        add("steel", k, px, base + slab + 0.525, atr.minZ + 0.06, 0.05, 1.05, 0.05);
      }
      for (let i = 1; i < 4; i++) {
        add("steel", k, atr.minX + 0.06, base + slab + 0.525, atr.minZ + (i * rd) / 4, 0.05, 1.05, 0.05);
      }
    }

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
      add("white", k, mx, dims.marqueeY + dims.marqueeT / 2, D / 2 + dims.marqueeD / 2 - 0.3, dims.marqueeW, dims.marqueeT, dims.marqueeD);
      for (const dx of [-dims.marqueeW / 2 + 0.3, dims.marqueeW / 2 - 0.3]) {
        add("white", k, mx + dx, dims.marqueeY / 2, D / 2 + dims.marqueeD - 0.55, 0.25, dims.marqueeY, 0.25);
      }
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
      add("glass", k, cwCx, yc, glassZ, cwW, H - 0.1, 0.08);
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
