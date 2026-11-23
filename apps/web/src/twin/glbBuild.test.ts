import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Plane, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { FloorBand } from "./glb";
import { buildGlbModel, effectivelyVisible } from "./glbBuild";
import { applyFloorState, countDegenerate, floorModeActive, glbDebugSnapshot } from "./glbRuntime";

const BANDS: FloorBand[] = [
  { level: 1, index: 0, baseY: 0, height: 4.8 },
  { level: 2, index: 1, baseY: 4.8, height: 3.6 },
  { level: 3, index: 2, baseY: 8.4, height: 3.6 },
];

const mats = new Map<string, MeshStandardMaterial>();
function mat(name: string): MeshStandardMaterial {
  let m = mats.get(name);
  if (!m) {
    m = new MeshStandardMaterial({ name });
    m.name = name;
    mats.set(name, m);
  }
  return m;
}
function mesh(name: string, material: string, y = 0, ud: Record<string, unknown> = {}): Mesh {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0, y, 0);
  const m = new Mesh(g, mat(material));
  m.name = name;
  m.userData = ud;
  return m;
}

/** GLB sintetico con la misma jerarquia que el de Blender. */
function fakeScene(): Object3D {
  const root = new Group();
  root.name = "BUILDING";
  for (const b of BANDS) {
    const f = new Group();
    f.name = `FLOOR_P0${b.level}`;
    f.add(mesh(`${f.name}_SLAB`, "SLAB", b.baseY, { level: b.level }));
    f.add(mesh(`${f.name}_TILE`, "TILE", b.baseY, { level: b.level }));
    f.add(mesh(`${f.name}_WHITE_PANEL`, "WHITE_PANEL", b.baseY, { level: b.level }));
    f.add(mesh(`${f.name}_WINDOW_NIGHT_GEN`, "WINDOW_NIGHT", b.baseY, { level: b.level }));
    if (b.level === 2) {
      f.add(mesh(`${f.name}_WINDOW_NIGHT_A201`, "WINDOW_NIGHT", b.baseY, { level: 2, space_code: "A201" }));
      const spc = mesh("SPC_2_A201", "SPC_VOLUME", 0, { space_id: "SPC_2_A201", level: 2 });
      spc.position.set(0, 6.5, 3);
      f.add(spc);
    }
    root.add(f);
  }
  const facade = new Group();
  facade.name = "FACADE";
  facade.add(mesh("FACADE_WHITE_PANEL", "WHITE_PANEL", 6));
  root.add(facade);
  const stairs = new Group();
  stairs.name = "STAIRS";
  stairs.add(mesh("STAIRS_WHITE_PANEL", "WHITE_PANEL", 6));
  root.add(stairs);
  const roof = new Group();
  roof.name = "ROOF";
  roof.add(mesh("ROOF_ROOF", "ROOF", 13));
  roof.add(mesh("ROOF_LED_CROWN", "LED_CROWN", 13));
  root.add(roof);
  const anchors = new Group();
  anchors.name = "SENSOR_ANCHORS";
  const a = new Object3D();
  a.name = "ANCHOR_SPC_2_A201";
  a.position.set(0, 8, 3);
  anchors.add(a);
  root.add(anchors);
  return root;
}

function build() {
  return buildGlbModel(fakeScene(), { bands: BANDS, clip: new Plane(new Vector3(0, 0, -1), 1000), shadows: false });
}

describe("buildGlbModel", () => {
  it("fusiona por material: menos mallas que el origen y un grupo por piso", () => {
    const m = build();
    expect(m.floors.size).toBe(3);
    expect(m.stats.wholeMeshes).toBeLessThan(m.stats.sourceMeshes);
    // WHOLE: SLAB, TILE, WHITE_PANEL (4 piezas fusionadas en 1), WINDOW_NIGHT (GEN x3), ROOF, LED_CROWN
    expect(m.stats.wholeMeshes).toBe(6);
    expect(m.stats.windowMeshes).toBe(1);
  });

  it("separa volumenes y anclas; el volumen cuelga de su piso", () => {
    const m = build();
    const v = m.spaces.get("SPC_2_A201")!;
    expect(v.parent).toBe(m.floors.get(2)!.group);
    expect(v.position.y).toBeCloseTo(6.5);
    expect(m.anchors.get("SPC_2_A201")!.y).toBeCloseTo(8);
  });

  it("ROOF viaja con el ultimo piso y las rebanadas compartidas hay una por piso", () => {
    const m = build();
    const names = (l: number) => m.floors.get(l)!.parts.map((p) => p.name);
    expect(names(3).some((n) => n.includes("ROOF"))).toBe(true);
    expect(names(1).some((n) => n.includes("ROOF"))).toBe(false);
    for (const l of [1, 2, 3]) expect(names(l).some((n) => n.includes("SLICE_WHITE_PANEL"))).toBe(true);
  });
});

describe("aislamiento y explosion del GLB", () => {
  it("aislar oculta los demas pisos con group.visible y deja las escalas en 1", () => {
    const m = build();
    applyFloorState(m, { isolatedLevel: 2, explode: 0, gap: 4, floorMode: floorModeActive(2, false, 0) });
    expect(m.floors.get(1)!.group.visible).toBe(false);
    expect(m.floors.get(2)!.group.visible).toBe(true);
    expect(m.floors.get(3)!.group.visible).toBe(false);
    expect(m.whole.visible).toBe(false);
    for (const f of m.floors.values()) {
      f.group.traverse((o) => {
        expect(o.scale.toArray()).toEqual([1, 1, 1]);
      });
    }
    expect(countDegenerate([m.whole, ...[...m.floors.values()].map((f) => f.group)])).toBe(0);
    const snap = glbDebugSnapshot(m);
    expect(snap.visibleByLevel["1"]).toBe(0);
    expect(snap.visibleByLevel["3"]).toBe(0);
    expect(snap.visibleByLevel["2"]).toBeGreaterThan(0);
    expect(snap.renderMode).toBe("floors");
  });

  it("sin aislamiento ni explosion se dibuja el edificio completo fusionado", () => {
    const m = build();
    applyFloorState(m, { isolatedLevel: null, explode: 0, gap: 4, floorMode: false });
    expect(m.whole.visible).toBe(true);
    for (const f of m.floors.values()) for (const p of f.parts) expect(effectivelyVisible(p, false)).toBe(false);
    expect(glbDebugSnapshot(m).visibleByLevel["1"]).toBeGreaterThan(0);
  });

  it("explotar desplaza position.y por piso y desplaza tambien la franja de recorte", () => {
    const m = build();
    applyFloorState(m, { isolatedLevel: null, explode: 1, gap: 4, floorMode: true });
    expect(m.floors.get(1)!.group.position.y).toBe(0);
    expect(m.floors.get(2)!.group.position.y).toBe(4);
    expect(m.floors.get(3)!.group.position.y).toBe(8);
    const f2 = m.floors.get(2)!;
    expect(f2.lo.constant).toBeCloseTo(-(4.8 + 4));
    expect(f2.hi.constant).toBeCloseTo(8.4 + 4);
  });

  it("el camino del GLB no usa escalas para aislar ni explotar (regresion de las losas negras)", () => {
    for (const file of ["glbRuntime.ts", "glbBuild.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(src, file).not.toMatch(/\.scale\.(set|setScalar|x|y|z|multiply)\b/);
      expect(src, file).not.toMatch(/setScalar|makeScale|\bscale\s*=/);
    }
  });
});
