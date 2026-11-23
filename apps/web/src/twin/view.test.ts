import { describe, expect, it } from "vitest";
import { boxCorners, initialViewFromBox, type BoxLike, type Vec3 } from "./view";

const BOX: BoxLike = { min: { x: -25.5, y: -0.6, z: -12.5 }, max: { x: 25.5, y: 22, z: 12.5 } };

/** Proyeccion en ndc con la misma geometria de camara usada por la funcion. */
function ndc(p: Vec3, pos: Vec3, target: Vec3, fovDeg: number, aspect: number) {
  const f = { x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z };
  const fl = Math.hypot(f.x, f.y, f.z);
  f.x /= fl;
  f.y /= fl;
  f.z /= fl;
  const rl = Math.hypot(f.x, f.z);
  const r = { x: -f.z / rl, y: 0, z: f.x / rl };
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const d = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return {
    depth,
    x: (d.x * r.x + d.y * r.y + d.z * r.z) / (depth * t * aspect),
    y: (d.x * u.x + d.y * u.y + d.z * u.z) / (depth * t),
  };
}

describe("initialViewFromBox", () => {
  for (const aspect of [1000 / 520, 1, 390 / 700, 2.4]) {
    it(`encuadra las 8 esquinas dentro del frustum (aspecto ${aspect.toFixed(2)})`, () => {
      const v = initialViewFromBox(BOX, { fovDeg: 35, aspect });
      for (const c of boxCorners(BOX)) {
        const p = ndc(c, v.position, v.target, 35, aspect);
        expect(p.depth).toBeGreaterThan(0);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.12 + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.12 + 1e-6);
      }
    });
  }

  it("mira al centro de la caja desde la fachada principal (+Z) con elevacion y azimut pedidos", () => {
    const v = initialViewFromBox(BOX, { fovDeg: 35, aspect: 2 });
    expect(v.target).toEqual({ x: 0, y: 10.7, z: 0 });
    const dx = v.position.x - v.target.x;
    const dy = v.position.y - v.target.y;
    const dz = v.position.z - v.target.z;
    expect(dz).toBeGreaterThan(0);
    expect(dx).toBeGreaterThan(0);
    const elev = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    const az = (Math.atan2(dx, dz) * 180) / Math.PI;
    expect(elev).toBeCloseTo(22, 5);
    expect(az).toBeCloseTo(35, 5);
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(v.distance, 6);
  });

  it("un lienzo mas estrecho aleja mas la camara", () => {
    const wide = initialViewFromBox(BOX, { fovDeg: 35, aspect: 2 });
    const narrow = initialViewFromBox(BOX, { fovDeg: 35, aspect: 0.6 });
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it("tolera aspecto invalido sin devolver NaN", () => {
    const v = initialViewFromBox(BOX, { fovDeg: 35, aspect: Number.NaN });
    expect(Number.isFinite(v.distance)).toBe(true);
    expect(Number.isFinite(v.position.x)).toBe(true);
  });
});
