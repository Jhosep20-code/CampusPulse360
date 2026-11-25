import { describe, expect, it } from "vitest";
import { DEFAULT_DIMS, TWIN_LEVELS } from "./constants";
import {
  ROW_BY_SPACE,
  atriumRect,
  computeLayout,
  coreRect,
  corridorOuterZ,
  crownTopY,
  floorLevels,
  levelBaseY,
  levelHeight,
  type Rect,
} from "./layout";
import { makeCampus } from "./fixtures";

const D = DEFAULT_DIMS;
const EPS = 1e-6;

const overlaps = (a: Rect, b: Rect) =>
  a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;
const rectOf = (s: { x: number; z: number; w: number; d: number }): Rect => ({
  minX: s.x - s.w / 2,
  maxX: s.x + s.w / 2,
  minZ: s.z - s.d / 2,
  maxZ: s.z + s.d / 2,
});

// Tabla 6 de la especificacion: id -> [nivel, fila (0 frente +Z, 1 fondo -Z)]
const TABLE6: Record<string, [number, 0 | 1]> = {
  SPC_1_LOBBY: [1, 0],
  SPC_1_BIB: [1, 1],
  SPC_2_A201: [2, 0],
  SPC_2_A202: [2, 1],
  SPC_3_A301: [3, 0],
  SPC_3_LAB1: [3, 1],
  SPC_4_A401: [4, 0],
  SPC_4_LAB2: [4, 1],
  SPC_5_OFI: [5, 0],
  SPC_5_AUD: [5, 1],
};

describe("computeLayout (10 niveles)", () => {
  for (const [name, campus] of [
    ["seed (10 espacios)", makeCampus()],
    ["piso 6 con 7 espacios", makeCampus(7)],
  ] as const) {
    describe(name, () => {
      const layout = computeLayout(campus, D, false);

      it("construye 10 niveles P1-P10", () => {
        expect(layout.floors).toHaveLength(10);
        expect(layout.floors.map((f) => f.level)).toEqual([...TWIN_LEVELS]);
      });

      it("coloca todos los espacios dentro de la huella y del piso", () => {
        expect(layout.spaces).toHaveLength(campus.spaces.length);
        for (const s of layout.spaces) {
          const floor = layout.floors.find((f) => f.level === s.level)!;
          expect(s.x - s.w / 2).toBeGreaterThanOrEqual(-D.footprintW / 2 - EPS);
          expect(s.x + s.w / 2).toBeLessThanOrEqual(D.footprintW / 2 + EPS);
          expect(s.z - s.d / 2).toBeGreaterThanOrEqual(-D.footprintD / 2 - EPS);
          expect(s.z + s.d / 2).toBeLessThanOrEqual(D.footprintD / 2 + EPS);
          expect(s.y - s.h / 2).toBeGreaterThanOrEqual(D.slab - EPS);
          expect(s.y + s.h / 2).toBeLessThanOrEqual(floor.height + EPS);
        }
      });

      it("no solapa espacios dentro de un mismo piso", () => {
        for (const f of layout.floors) {
          const list = layout.spaces.filter((s) => s.level === f.level);
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i]!;
              const b = list[j]!;
              expect(overlaps(rectOf(a), rectOf(b)), `${a.id} solapa ${b.id}`).toBe(false);
            }
          }
        }
      });

      it("el atrio y el nucleo no se solapan con los espacios ni entre si", () => {
        const atrium = atriumRect(D);
        const core = coreRect(D);
        expect(overlaps(atrium, core)).toBe(false);
        for (const s of layout.spaces) {
          expect(overlaps(rectOf(s), atrium), `${s.id} invade el atrio`).toBe(false);
          expect(overlaps(rectOf(s), core), `${s.id} invade el nucleo`).toBe(false);
          expect(Math.abs(s.z) - s.d / 2).toBeGreaterThanOrEqual(corridorOuterZ(D) - EPS);
        }
      });

      it("el atrio y el nucleo caben dentro de la huella", () => {
        for (const r of [atriumRect(D), coreRect(D)]) {
          expect(r.minX).toBeGreaterThan(-D.footprintW / 2);
          expect(r.maxX).toBeLessThan(D.footprintW / 2);
          expect(r.minZ).toBeGreaterThan(-D.footprintD / 2);
          expect(r.maxZ).toBeLessThan(D.footprintD / 2);
        }
      });

      it("conserva mesh_id y nivel del espacio", () => {
        for (const s of layout.spaces) {
          const src = campus.spaces.find((c) => c.id === s.id);
          expect(src?.mesh_id).toBe(s.meshId);
          expect(src?.level).toBe(s.level);
        }
      });
    });
  }

  it("los 10 espacios SPC_* conservan id, piso (P1-P5) y fila frente/fondo de la tabla 6", () => {
    const layout = computeLayout(makeCampus(), D, false);
    for (const [id, [level, row]] of Object.entries(TABLE6)) {
      const s = layout.byId.get(id);
      expect(s, id).toBeDefined();
      expect(s!.level).toBe(level);
      expect(s!.row).toBe(row);
      expect(row === 0 ? s!.z > 0 : s!.z < 0).toBe(true);
      expect(ROW_BY_SPACE[id]).toBe(row);
    }
    expect(layout.spaces).toHaveLength(10);
  });

  it("P6-P10 existen como niveles sin espacios", () => {
    const layout = computeLayout(makeCampus(), D, false);
    for (const level of [6, 7, 8, 9, 10]) {
      const f = layout.floors.find((x) => x.level === level);
      expect(f, `P${level}`).toBeDefined();
      expect(f!.spaceIds).toEqual([]);
      expect(layout.spaces.some((s) => s.level === level)).toBe(false);
    }
  });

  it("las alturas no son uniformes: planta baja de 4,8 m y 39,6 m hasta la coronacion", () => {
    expect(levelHeight(0, D)).toBeCloseTo(4.8);
    expect(levelHeight(1, D)).toBeCloseTo(3.6);
    expect(levelHeight(0, D) / levelHeight(1, D)).toBeGreaterThanOrEqual(1.3);
    expect(levelHeight(0, D) / levelHeight(1, D)).toBeLessThanOrEqual(1.6);
    expect(levelBaseY(1, D)).toBeCloseTo(4.8);
    expect(levelBaseY(2, D)).toBeCloseTo(8.4);
    expect(crownTopY(10, D)).toBeCloseTo(39.6);
    const layout = computeLayout(makeCampus(), D, false);
    expect(layout.bounds.maxY).toBeCloseTo(40.5);
    expect(D.footprintW / crownTopY(10, D)).toBeGreaterThan(0.8);
    expect(D.footprintW / crownTopY(10, D)).toBeLessThan(1.0);
  });

  it("la vista explotada aumenta la separacion entre pisos", () => {
    const campus = makeCampus();
    const compact = computeLayout(campus, D, false);
    const exploded = computeLayout(campus, D, true);
    expect(compact.floors).toHaveLength(10);
    for (let i = 1; i < compact.floors.length; i++) {
      const c = compact.floors[i]!.y - compact.floors[i - 1]!.y;
      const e = exploded.floors[i]!.y - exploded.floors[i - 1]!.y;
      expect(c).toBeCloseTo(levelHeight(i - 1, D));
      expect(e).toBeCloseTo(levelHeight(i - 1, D) + D.explodeGap);
    }
    expect(exploded.bounds.maxY).toBeGreaterThan(compact.bounds.maxY);
  });

  it("acepta una fraccion de explosion intermedia", () => {
    const half = computeLayout(makeCampus(), D, 0.5);
    expect(half.floors[1]!.y).toBeCloseTo(D.groundFloorHeight + D.explodeGap / 2);
  });

  it("ordena los niveles de forma ascendente, siempre P1-P10", () => {
    expect(floorLevels(makeCampus(2))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(floorLevels(makeCampus())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
