import { describe, expect, it } from "vitest";
import { DEFAULT_DIMS } from "./constants";
import { computeLayout, floorLevels } from "./layout";
import { makeCampus } from "./fixtures";

const D = DEFAULT_DIMS;
const EPS = 1e-6;

describe("computeLayout", () => {
  for (const [name, campus] of [
    ["seed (10 espacios)", makeCampus()],
    ["piso con 7 espacios", makeCampus(7)],
  ] as const) {
    describe(name, () => {
      const layout = computeLayout(campus, D, false);

      it("coloca todos los espacios dentro de la huella", () => {
        expect(layout.spaces).toHaveLength(campus.spaces.length);
        for (const s of layout.spaces) {
          expect(s.x - s.w / 2).toBeGreaterThanOrEqual(-D.footprintW / 2 - EPS);
          expect(s.x + s.w / 2).toBeLessThanOrEqual(D.footprintW / 2 + EPS);
          expect(s.z - s.d / 2).toBeGreaterThanOrEqual(-D.footprintD / 2 - EPS);
          expect(s.z + s.d / 2).toBeLessThanOrEqual(D.footprintD / 2 + EPS);
          expect(s.y - s.h / 2).toBeGreaterThanOrEqual(D.slab - EPS);
          expect(s.y + s.h / 2).toBeLessThanOrEqual(D.floorHeight + EPS);
        }
      });

      it("no solapa espacios dentro de un mismo piso", () => {
        for (const f of layout.floors) {
          const list = layout.spaces.filter((s) => s.level === f.level);
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i]!;
              const b = list[j]!;
              const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - EPS;
              const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - EPS;
              expect(overlapX && overlapZ, `${a.id} solapa ${b.id}`).toBe(false);
            }
          }
        }
      });

      it("no invade el pasillo central ni el nucleo", () => {
        for (const s of layout.spaces) {
          expect(Math.abs(s.z) - s.d / 2).toBeGreaterThanOrEqual(D.corridorW / 2 - EPS);
          expect(s.x + s.w / 2).toBeLessThanOrEqual(D.footprintW / 2 - D.wallInset - D.coreW + EPS);
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

  it("la vista explotada aumenta la separacion entre pisos", () => {
    const campus = makeCampus();
    const compact = computeLayout(campus, D, false);
    const exploded = computeLayout(campus, D, true);
    expect(compact.floors).toHaveLength(5);
    for (let i = 1; i < compact.floors.length; i++) {
      const c = compact.floors[i]!.y - compact.floors[i - 1]!.y;
      const e = exploded.floors[i]!.y - exploded.floors[i - 1]!.y;
      expect(c).toBeCloseTo(D.floorHeight);
      expect(e).toBeCloseTo(D.floorHeight + D.explodeGap);
      expect(e).toBeGreaterThan(c);
    }
    expect(exploded.bounds.maxY).toBeGreaterThan(compact.bounds.maxY);
  });

  it("acepta una fraccion de explosion intermedia", () => {
    const campus = makeCampus();
    const half = computeLayout(campus, D, 0.5);
    expect(half.floors[1]!.y).toBeCloseTo(D.floorHeight + D.explodeGap / 2);
  });

  it("ordena los niveles de forma ascendente", () => {
    expect(floorLevels(makeCampus(2))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
