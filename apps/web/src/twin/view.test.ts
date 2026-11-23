import { describe, expect, it } from "vitest";
import {
  CAMERA_LIMITS,
  TWIN_PRESETS,
  boxCorners,
  floorFocusView,
  initialViewFromBox,
  minCameraHeight,
  presetView,
  type BoxLike,
  type Vec3,
} from "./view";

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
    const v = initialViewFromBox(BOX, { fovDeg: 35, aspect: 2, elevationDeg: 22, azimuthDeg: 35 });
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

describe("camara por defecto y presets", () => {
  const BUILDING: BoxLike = { min: { x: -19, y: 0, z: -15 }, max: { x: 19, y: 40.5, z: 18.7 } };
  const ATRIUM: BoxLike = { min: { x: -5, y: 0, z: -4.5 }, max: { x: 16, y: 39.6, z: 4.5 } };
  const opts = { fovDeg: 35, aspect: 1000 / 560 };
  const angles = (v: { position: Vec3; target: Vec3 }) => {
    const dx = v.position.x - v.target.x;
    const dy = v.position.y - v.target.y;
    const dz = v.position.z - v.target.z;
    return {
      az: (Math.atan2(dx, dz) * 180) / Math.PI,
      el: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
      dist: Math.hypot(dx, dy, dz),
    };
  };

  it("el valor por defecto es azimut -30 y elevacion 14 (especificacion 5.7)", () => {
    const a = angles(initialViewFromBox(BUILDING, opts));
    expect(a.az).toBeCloseTo(-30, 5);
    expect(a.el).toBeCloseTo(14, 5);
  });

  it("define los 4 presets: Fachada, Aerea, Atrio y Referencia", () => {
    expect(TWIN_PRESETS.map((p) => p.label)).toEqual(["Fachada", "Aérea", "Atrio", "Referencia"]);
    for (const p of TWIN_PRESETS) expect(p.description.length).toBeGreaterThan(5);
  });

  it("Referencia: azimut -30, elevacion 13 y 90 m de distancia fija", () => {
    const v = presetView("reference", BUILDING, ATRIUM, opts);
    const a = angles(v);
    expect(a.az).toBeCloseTo(-30, 4);
    expect(a.el).toBeCloseTo(13, 4);
    expect(a.dist).toBeCloseTo(90, 6);
    expect(v.target.y).toBeCloseTo(18.5, 6);
  });

  it("Aerea mira desde mas arriba que Fachada y todas las vistas quedan sobre el suelo", () => {
    const facade = presetView("facade", BUILDING, ATRIUM, opts);
    const aerial = presetView("aerial", BUILDING, ATRIUM, opts);
    expect(angles(aerial).el).toBeGreaterThan(angles(facade).el + 20);
    for (const p of TWIN_PRESETS) {
      const v = presetView(p.id, BUILDING, ATRIUM, opts);
      expect(v.position.y).toBeGreaterThan(0);
      expect(v.target.y).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(v.distance)).toBe(true);
    }
  });

  it("Atrio apunta al vacio del atrio", () => {
    const v = presetView("atrium", BUILDING, ATRIUM, opts);
    expect(v.target.x).toBeGreaterThan(ATRIUM.min.x);
    expect(v.target.x).toBeLessThan(ATRIUM.max.x);
  });

  it("el enfoque de piso mira desde arriba al piso aislado", () => {
    const floor: BoxLike = { min: { x: -19, y: 33.6, z: -15 }, max: { x: 19, y: 37.2, z: 15 } };
    const v = floorFocusView(floor, opts);
    expect(v.position.y).toBeGreaterThan(floor.max.y);
    expect(angles(v).el).toBeCloseTo(38, 5);
  });

  it("los limites de orbita impiden pasar bajo el suelo", () => {
    expect(CAMERA_LIMITS.maxPolarAngle).toBeLessThan(Math.PI / 2);
    expect(CAMERA_LIMITS.minDistance).toBeGreaterThan(0);
    expect(minCameraHeight(0, CAMERA_LIMITS.maxDistance, CAMERA_LIMITS.maxPolarAngle)).toBeGreaterThanOrEqual(0);
    expect(minCameraHeight(-5, 50, Math.PI)).toBeGreaterThanOrEqual(0);
  });
});
