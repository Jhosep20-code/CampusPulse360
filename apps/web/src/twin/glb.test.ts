import { describe, expect, it } from "vitest";
import {
  classifyNode,
  contextMaterialAllowed,
  floorLevelAtY,
  floorLevelFromName,
  floorNodeName,
  glbUrlsForProfile,
  planMerge,
  sliceRange,
  windowSpaceMeshId,
  type FloorBand,
} from "./glb";

const BANDS: FloorBand[] = [
  { level: 1, index: 0, baseY: 0, height: 4.8 },
  { level: 2, index: 1, baseY: 4.8, height: 3.6 },
  { level: 3, index: 2, baseY: 8.4, height: 3.6 },
];

describe("nombres del GLB", () => {
  it("FLOOR_Pxx -> nivel", () => {
    expect(floorLevelFromName("FLOOR_P01")).toBe(1);
    expect(floorLevelFromName("FLOOR_P10")).toBe(10);
    expect(floorLevelFromName("FLOOR_P03.001")).toBe(3);
    expect(floorLevelFromName("FLOOR_P03_SLAB")).toBeNull();
    expect(floorLevelFromName("FACADE")).toBeNull();
    expect(floorNodeName(3)).toBe("FLOOR_P03");
    expect(floorNodeName(10)).toBe("FLOOR_P10");
  });

  it("clasifica cada tipo de nodo", () => {
    expect(classifyNode("BUILDING")).toEqual({ kind: "root" });
    expect(classifyNode("CONTEXT")).toEqual({ kind: "context" });
    expect(classifyNode("FLOOR_P05")).toEqual({ kind: "floor", level: 5 });
    expect(classifyNode("FLOOR_P05_WINDOW_NIGHT_AUD")).toEqual({ kind: "floorPart", level: 5 });
    expect(classifyNode("FACADE_WHITE_PANEL")).toEqual({ kind: "shared", group: "FACADE" });
    expect(classifyNode("ROOF")).toEqual({ kind: "shared", group: "ROOF" });
    expect(classifyNode("ELEVATORS_CORE_BLACK")).toEqual({ kind: "shared", group: "ELEVATORS" });
    expect(classifyNode("SPC_3_LAB1")).toEqual({ kind: "space", meshId: "SPC_3_LAB1" });
    expect(classifyNode("SPC_3_LAB1.001")).toEqual({ kind: "space", meshId: "SPC_3_LAB1" });
    expect(classifyNode("ANCHOR_SPC_3_LAB1")).toEqual({ kind: "anchor", meshId: "SPC_3_LAB1" });
    expect(classifyNode("SENSOR_ANCHORS")).toEqual({ kind: "anchors" });
    expect(classifyNode("Cube")).toEqual({ kind: "other" });
  });

  it("ventana nocturna de un espacio -> mesh_id", () => {
    expect(windowSpaceMeshId(2, "A201")).toBe("SPC_2_A201");
  });
});

describe("fusion por grupo y material", () => {
  it("agrupa por (grupo x material) sin mezclar pisos", () => {
    const buckets = planMerge([
      { id: "0", group: "FLOOR_P01", material: "SLAB" },
      { id: "1", group: "FLOOR_P01", material: "TILE" },
      { id: "2", group: "FLOOR_P01", material: "SLAB" },
      { id: "3", group: "FLOOR_P02", material: "SLAB" },
      { id: "4", group: "FACADE", material: "WHITE_PANEL" },
    ]);
    expect(buckets.map((b) => [b.group, b.material, b.ids])).toEqual([
      ["FLOOR_P01", "SLAB", ["0", "2"]],
      ["FLOOR_P01", "TILE", ["1"]],
      ["FLOOR_P02", "SLAB", ["3"]],
      ["FACADE", "WHITE_PANEL", ["4"]],
    ]);
  });

  it("una lista vacia no produce cubetas", () => {
    expect(planMerge([])).toEqual([]);
  });
});

describe("franjas de piso", () => {
  it("nivel segun la cota", () => {
    expect(floorLevelAtY(1, BANDS)).toBe(1);
    expect(floorLevelAtY(4.8, BANDS)).toBe(2);
    expect(floorLevelAtY(11.9, BANDS)).toBe(3);
    expect(floorLevelAtY(12.0, BANDS)).toBeNull();
    expect(floorLevelAtY(-1, BANDS)).toBeNull();
  });

  it("rango de recorte: cimientos hacia abajo y coronacion hacia arriba", () => {
    expect(sliceRange(BANDS, 1)).toEqual({ lo: -1000, hi: 4.8 });
    expect(sliceRange(BANDS, 2)).toEqual({ lo: 4.8, hi: 8.4 });
    expect(sliceRange(BANDS, 3)).toEqual({ lo: 8.4, hi: 1000 });
    expect(sliceRange(BANDS, 9)).toBeNull();
  });
});

describe("perfil y URLs", () => {
  const base = { high: "/models/a.glb", low: "/models/a-mobile.glb", context: "/models/c.glb" };
  it("LOD completo en alto y movil en bajo", () => {
    expect(glbUrlsForProfile("high", base).building).toBe("/models/a.glb");
    expect(glbUrlsForProfile("low", base).building).toBe("/models/a-mobile.glb");
    expect(glbUrlsForProfile("low", base).context).toBe("/models/c.glb");
  });
  it("en bajo el contexto se reduce a suelo y calle", () => {
    expect(contextMaterialAllowed("low", "GROUND")).toBe(true);
    expect(contextMaterialAllowed("low", "ASPHALT")).toBe(true);
    expect(contextMaterialAllowed("low", "CONTEXT_BRICK")).toBe(false);
    expect(contextMaterialAllowed("high", "CONTEXT_BRICK")).toBe(true);
  });
});
