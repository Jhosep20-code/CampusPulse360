import { describe, expect, it } from "vitest";
import { estimateBudget } from "./budget";
import { DEFAULT_DIMS, TWIN_LEVELS } from "./constants";
import { BATCH_KEYS, buildBuilding, curtainColumns } from "./facade";
import { makeCampus } from "./fixtures";
import { computeLayout } from "./layout";

const D = DEFAULT_DIMS;

describe("presupuesto de render (analitico)", () => {
  for (const profile of ["high", "low"] as const) {
    describe(`perfil ${profile}`, () => {
      const b = estimateBudget(makeCampus(), D, profile);

      it("no pasa de 60 draw calls en el peor caso (datos + noche + sombras)", () => {
        expect(b.drawCallsPeak).toBeLessThanOrEqual(60);
        expect(b.drawCallsMain).toBeLessThanOrEqual(60);
      });

      it("mantiene los triangulos bajo 40k", () => {
        expect(b.trianglesMain).toBeLessThan(40_000);
      });

      it("usa una InstancedMesh por material, no una malla por piso", () => {
        expect(b.batchDrawCalls).toBeLessThanOrEqual(BATCH_KEYS.length);
        expect(b.floors).toBe(TWIN_LEVELS.length);
        expect(b.spaces).toBe(10);
      });
    });
  }

  it("el perfil movil no tiene pase de sombras y reduce el contexto urbano", () => {
    const high = estimateBudget(makeCampus(), D, "high");
    const low = estimateBudget(makeCampus(), D, "low");
    expect(low.drawCallsShadowPass).toBe(0);
    expect(high.drawCallsShadowPass).toBeGreaterThan(0);
    expect(low.instances.context ?? 0).toBeLessThan(high.instances.context ?? 0);
    expect(low.trianglesMain).toBeLessThan(high.trianglesMain);
  });

  it("sigue dentro del presupuesto con espacios extra en P6", () => {
    const b = estimateBudget(makeCampus(7), D, "high");
    expect(b.drawCallsPeak).toBeLessThanOrEqual(60);
    expect(b.trianglesMain).toBeLessThan(40_000);
  });
});

describe("geometria del edificio (especificacion 5.1-5.6)", () => {
  const layout = computeLayout(makeCampus(), D, false);
  const building = buildBuilding(D, layout, "dense");

  it("tiene 10 niveles de alturas no uniformes y llega a 39,6 m de coronacion", () => {
    expect(building.levelBase).toHaveLength(10);
    expect(building.levelHeight[0]).toBeCloseTo(4.8);
    expect(building.levelHeight[1]).toBeCloseTo(3.6);
    expect(building.crownTop).toBeCloseTo(39.6, 6);
    expect(building.topY).toBeCloseTo(40.5, 6);
  });

  it("el muro cortina tiene 24 columnas por piso y solo existe de P2 a P10 en +Z", () => {
    expect(curtainColumns(D)).toBe(24);
    expect(building.boxes.glass).toHaveLength(9);
    expect(new Set(building.boxes.glass.map((g) => g.level))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const principal = building.boxes.frame.filter((f) => f.level === 3 && Math.abs(f.sx - 0.25) < 1e-9);
    const secondary = building.boxes.frame.filter((f) => f.level === 3 && Math.abs(f.sx - 0.08) < 1e-9);
    expect(principal).toHaveLength(7);
    expect(secondary).toHaveLength(18);
    for (const g of building.boxes.glass) expect(g.z).toBeGreaterThan(D.footprintD / 2 - 1);
  });

  it("la planta baja tiene 7 pilastras, marquesina y vidrio retranqueado 1,5 m", () => {
    const piers = building.boxes.white.filter(
      (w) => w.level === 0 && Math.abs(w.sx - 0.6) < 1e-9 && Math.abs(w.sz - 0.6) < 1e-9,
    );
    expect(piers).toHaveLength(7);
    const marquee = building.boxes.white.find((w) => Math.abs(w.sx - 10) < 1e-9 && Math.abs(w.sz - 4) < 1e-9);
    expect(marquee).toBeDefined();
    expect(marquee!.y - 0.125).toBeCloseTo(3.5, 6);
    const dark = building.boxes.glassGround.find((g) => g.level === 0 && g.sx > 30 && g.z > 0);
    expect(dark!.z).toBeCloseTo(D.footprintD / 2 - 1.5, 6);
  });

  it("hay acento rojo cuadrado, linea LED y caja tecnica retrasada", () => {
    expect(building.boxes.red).toHaveLength(1);
    const red = building.boxes.red[0]!;
    expect(red.sx).toBeCloseTo(red.sy, 6);
    expect(red.x).toBeGreaterThan(0);
    expect(building.boxes.led.length).toBeGreaterThanOrEqual(3);
    const roofBox = building.boxes.white.find((w) => Math.abs(w.sx - 14) < 1e-9 && Math.abs(w.sy - 3) < 1e-9);
    expect(roofBox).toMatchObject({ x: -6, z: -6 });
  });

  it("incluye nucleo de ascensores, barandas del atrio y entorno (excluido en AR)", () => {
    expect(building.boxes.coreBlack).toHaveLength(10);
    expect(building.boxes.steel.length).toBeGreaterThan(200);
    expect(building.boxes.hedge.length).toBeGreaterThan(0);
    expect(building.boxes.context.length).toBeGreaterThan(50);
    const bare = buildBuilding(D, layout, "none", false);
    expect(bare.boxes.hedge).toHaveLength(0);
    expect(bare.boxes.context).toHaveLength(0);
  });

  it("ventanas nocturnas: patron estable en P6-P10 y espacios ligados en P2-P5", () => {
    const again = buildBuilding(D, layout, "dense");
    expect(again.windows.map((w) => w.seed)).toEqual(building.windows.map((w) => w.seed));
    const upper = building.windows.filter((w) => w.level >= 5);
    expect(upper.length).toBeGreaterThan(0);
    expect(upper.every((w) => w.spaceId === null)).toBe(true);
    const mid = building.windows.filter((w) => w.level >= 1 && w.level <= 4 && w.ry === 0);
    expect(mid.every((w) => w.spaceId !== null)).toBe(true);
  });
});
