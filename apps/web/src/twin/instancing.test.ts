import { describe, expect, it } from "vitest";
import { instanceTransform, instancedNormalIsFinite, MIN_SQUASH } from "./instancing";

const slab = { level: 5, x: 0, y: 26.2, z: 0, sx: 38, sy: 0.3, sz: 30 };

/** Logica ANTERIOR (defectuosa), reproducida para demostrar el fallo. */
function legacy(b: typeof slab, v: number, base: number) {
  const sy = v < 0.003 ? 0 : b.sy * v;
  return { x: b.x, y: base + (b.y - base) * v, z: b.z, sx: b.sx, sy, sz: b.sz, hidden: false };
}

describe("transformacion de instancias por visibilidad de piso", () => {
  it("la logica anterior dejaba un plano de 38x30 m con normal no finita (losa negra)", () => {
    const t = legacy(slab, 0, 26);
    expect(t.sx * t.sz).toBeGreaterThan(1000); // plano de tamano completo
    expect(instancedNormalIsFinite(t)).toBe(false); // NaN/Inf -> negro
  });

  it("un piso oculto produce matriz nula en los tres ejes (no se dibuja ni da sombra)", () => {
    const t = instanceTransform(slab, 0, 0, 26, 4);
    expect(t).toMatchObject({ sx: 0, sy: 0, sz: 0, hidden: true });
  });

  it("durante la transicion la escala Y nunca baja del minimo y la normal es finita", () => {
    for (const v of [0.004, 0.01, 0.1, 0.5, 0.99]) {
      const t = instanceTransform(slab, v, 0, 26, 4);
      expect(t.sy).toBeGreaterThanOrEqual(slab.sy * MIN_SQUASH - 1e-9);
      expect(instancedNormalIsFinite(t)).toBe(true);
    }
  });

  it("visible: transformacion original; explotado: desplazamiento por piso", () => {
    expect(instanceTransform(slab, 1, 0, 26, 4)).toMatchObject({ y: 26.2, sx: 38, sy: 0.3, sz: 30, hidden: false });
    expect(instanceTransform(slab, 1, 1, 26, 4).y).toBeCloseTo(26.2 + 5 * 4);
  });

  it("los elementos sin piso (entorno) no se alteran", () => {
    const t = instanceTransform({ ...slab, level: -1 }, 0, 1, 0, 4);
    expect(t).toMatchObject({ sx: 38, sy: 0.3, sz: 30, hidden: false });
  });
});
