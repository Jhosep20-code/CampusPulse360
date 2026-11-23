import type { BBox } from "./facade";

/**
 * Entorno ESTIMADO del edificio (sin datos reales de la manzana): lote con valla,
 * seto y vereda, calle, luminarias, contexto urbano bajo de cajas y cerros de
 * fondo. Funciones puras, sin three. Todo es representativo, no medido.
 */

/** Hash determinista en [0,1) para patrones estables (ventanas, contexto). */
export function hash01(n: number): number {
  let t = (Math.trunc(n) + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ContextDensity = "none" | "sparse" | "dense";

/** Lote del edificio (m). ESTIMACION. */
export const LOT = { minX: -34, maxX: 34, minZ: -26, maxZ: 22 } as const;
const STREET_Z = 32.5;

export interface EnvironmentBoxes {
  sidewalk: BBox[];
  asphalt: BBox[];
  hedge: BBox[];
  /** Postes y travesanos de la valla y postes de luminarias (material de carpinteria). */
  frame: BBox[];
  lampHead: BBox[];
  context: BBox[];
}

const S = (x: number, y: number, z: number, sx: number, sy: number, sz: number): BBox => ({
  level: -1,
  x,
  y,
  z,
  sx,
  sy,
  sz,
});

const BRICK = ["#A9614B", "#B87358", "#9A5A47", "#C27A5E", "#8F5442"];
const STUCCO = ["#D9CBB4", "#CFC0A8", "#E4DAC7", "#BDAE97", "#D3C3A4", "#C9B79B", "#B9C3B0", "#C9B4A2"];
const ROOFS = ["#C9CDD2", "#B9BEC4", "#D8D3C8", "#A9715A", "#DDDFE2"];

/** Elige un color de una lista de forma determinista. */
const pick = (list: readonly string[], r: number): string => list[Math.min(list.length - 1, Math.floor(r * list.length))] ?? "#CCCCCC";

/**
 * Cajas del contexto urbano: 2 a 4 pisos (6,5 a 12,5 m), lejos del lote, la calle y la vereda.
 * Alturas variadas, giros leves, color por instancia (ladrillo, tarrajeo) y techos claros con
 * tanques ocasionales. Son MENOS cajas y mas lejanas que antes, para no competir con la sede.
 */
export function buildContextBoxes(density: ContextDensity): BBox[] {
  if (density === "none") return [];
  const rnd = mulberry32(20261122);
  const out: BBox[] = [];
  let i = 0;
  for (let cx = -216; cx <= 216; cx += 36) {
    for (let cz = -216; cz <= 252; cz += 36) {
      const jx = (rnd() - 0.5) * 14;
      const jz = (rnd() - 0.5) * 14;
      const sx = 10 + rnd() * 12;
      const sz = 10 + rnd() * 10;
      const floors = 2 + Math.floor(rnd() * 3);
      const h = floors * 3 + 0.5 + rnd() * 1.2;
      const keep = rnd();
      const material = rnd();
      const roofPick = rnd();
      const tank = rnd();
      const turn = rnd() < 0.35 ? (rnd() - 0.5) * 0.3 : 0;
      i++;
      const x = cx + jx;
      const z = cz + jz;
      // Lote, vereda, calle y una franja amplia alrededor quedan libres.
      if (Math.abs(x) < 64 && z > -58 && z < 78) continue;
      if (keep > 0.42) continue;
      if (density === "sparse" && (i % 3 !== 0 || Math.hypot(x, z) > 140)) continue;
      const body = material < 0.42 ? pick(BRICK, rnd()) : pick(STUCCO, rnd());
      out.push({ ...S(x, h / 2, z, sx, h, sz), color: body, ry: turn });
      out.push({ ...S(x, h + 0.15, z, sx + 0.5, 0.3, sz + 0.5), color: pick(ROOFS, roofPick), ry: turn });
      if (tank < 0.3) out.push({ ...S(x + sx * 0.2, h + 0.9, z - sz * 0.15, 1.6, 1.2, 1.6), color: "#D4D6D9", ry: turn });
    }
  }
  return out;
}

export function buildEnvironmentBoxes(entranceX: number, density: ContextDensity): EnvironmentBoxes {
  const { minX, maxX, minZ, maxZ } = LOT;
  const sidewalk: BBox[] = [
    // Piso del lote (cota 0 = planta baja).
    S((minX + maxX) / 2, -0.1, (minZ + maxZ) / 2, maxX - minX, 0.2, maxZ - minZ),
    // Vereda publica frente al lote.
    S(0, -0.1, 25.2, 160, 0.2, 3.6),
  ];
  const asphalt: BBox[] = [S(0, -0.13, STREET_Z, 420, 0.1, 10)];

  // Seto verde por delante de la valla (lado calle) con una apertura en el ingreso.
  const hedgeT = 0.9;
  const hz = maxZ + 0.9;
  const gap0 = entranceX - 3.5;
  const gap1 = entranceX + 3.5;
  const hedge: BBox[] = [
    S((minX + gap0) / 2, 0.5, hz, gap0 - minX, 1.0, hedgeT),
    S((gap1 + maxX) / 2, 0.5, hz, maxX - gap1, 1.0, hedgeT),
    S(minX - 0.9, 0.5, (minZ + maxZ) / 2, hedgeT, 1.0, maxZ - minZ + 1.8),
    S(maxX + 0.9, 0.5, (minZ + maxZ) / 2, hedgeT, 1.0, maxZ - minZ + 1.8),
    S(0, 0.5, minZ - 0.9, maxX - minX, 1.0, hedgeT),
  ];

  // Valla: postes cada 3 m y dos travesanos por tramo.
  const frame: BBox[] = [];
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const z = z0 + ((z1 - z0) * k) / n;
      frame.push(S(x, 0.9, z, 0.08, 1.8, 0.08));
    }
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    for (const y of [0.55, 1.5]) {
      frame.push(
        alongX
          ? S((x0 + x1) / 2, y, z0, Math.abs(x1 - x0), 0.05, 0.05)
          : S(x0, y, (z0 + z1) / 2, 0.05, 0.05, Math.abs(z1 - z0)),
      );
    }
  };
  const fz = maxZ + 0.1;
  run(minX, fz, gap0, fz);
  run(gap1, fz, maxX, fz);
  run(minX, minZ, minX, fz);
  run(maxX, minZ, maxX, fz);
  run(minX, minZ, maxX, minZ);

  // Luminarias de calle sobre la vereda.
  const lampHead: BBox[] = [];
  for (const x of [-30, -15, 0, 15, 30]) {
    frame.push(S(x, 3.5, 26.4, 0.14, 7, 0.14));
    frame.push(S(x, 7.0, 27.4, 0.1, 0.1, 2.2));
    lampHead.push(S(x, 6.9, 28.3, 0.5, 0.12, 0.9));
  }

  return { sidewalk, asphalt, hedge, frame, lampHead, context: buildContextBoxes(density) };
}

/** Malla simple de cerros: anillo inclinado hacia el centro con altura variable. */
export function buildHillRing(
  segments = 96,
  radius = 380,
): { positions: Float32Array; indices: Uint16Array } {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices = new Uint16Array(segments * 6);
  for (let i = 0; i <= segments; i++) {
    const a = ((i % segments) / segments) * Math.PI * 2;
    const h = 48 + 22 * Math.sin(3 * a + 0.7) + 12 * Math.sin(7 * a + 2.1) + 5 * Math.sin(13 * a);
    const bi = i * 6;
    positions[bi] = Math.cos(a) * radius;
    positions[bi + 1] = -2;
    positions[bi + 2] = Math.sin(a) * radius;
    positions[bi + 3] = Math.cos(a) * radius * 0.88;
    positions[bi + 4] = h;
    positions[bi + 5] = Math.sin(a) * radius * 0.88;
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const k = i * 6;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k);
  }
  return { positions, indices };
}
