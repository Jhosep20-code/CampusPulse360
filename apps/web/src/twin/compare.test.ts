import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERLAY_OPACITY,
  clampOpacity,
  convexHull,
  createPhotoSlot,
  initialCompareState,
  isImageFile,
  letterboxRect,
  opacityToPercent,
  percentToOpacity,
  photoLayerOpacity,
  projectToFrame,
  reduceCompare,
  referenceSilhouette,
} from "./compare";
import { presetView } from "./view";

const BOX = { min: { x: -19, y: 0, z: -15 }, max: { x: 19, y: 39.6, z: 15 } };

describe("comparador de referencia: limites de opacidad", () => {
  it("acota a 0..1 y tolera valores invalidos", () => {
    expect(clampOpacity(-0.4)).toBe(0);
    expect(clampOpacity(3)).toBe(1);
    expect(clampOpacity(0.3)).toBe(0.3);
    expect(clampOpacity(Number.NaN)).toBe(DEFAULT_OVERLAY_OPACITY);
    expect(percentToOpacity(150)).toBe(1);
    expect(percentToOpacity(-5)).toBe(0);
    expect(opacityToPercent(0.5)).toBe(50);
  });
});

describe("comparador de referencia: estado", () => {
  it("empieza solo con el render y sin foto", () => {
    expect(initialCompareState).toMatchObject({ photoUrl: null, mode: "render", guides: "none" });
    expect(photoLayerOpacity(initialCompareState)).toBe(0);
  });

  it("sin foto no se puede cambiar a Foto ni Superposicion", () => {
    expect(reduceCompare(initialCompareState, { type: "mode", mode: "photo" }).mode).toBe("render");
    expect(reduceCompare(initialCompareState, { type: "mode", mode: "overlay" }).mode).toBe("render");
  });

  it("al cargar una foto pasa a superposicion y la capa respeta la opacidad", () => {
    let s = reduceCompare(initialCompareState, { type: "load", url: "blob:x" });
    expect(s).toMatchObject({ photoUrl: "blob:x", mode: "overlay" });
    s = reduceCompare(s, { type: "opacity", value: 0.8 });
    expect(photoLayerOpacity(s)).toBe(0.8);
    s = reduceCompare(s, { type: "opacity", value: 9 });
    expect(photoLayerOpacity(s)).toBe(1);
    s = reduceCompare(s, { type: "mode", mode: "render" });
    expect(photoLayerOpacity(s)).toBe(0);
    s = reduceCompare(s, { type: "mode", mode: "photo" });
    expect(photoLayerOpacity(s)).toBe(1);
  });

  it("quitar la foto o reiniciar vuelve al render", () => {
    const loaded = reduceCompare(initialCompareState, { type: "load", url: "blob:x" });
    expect(reduceCompare(loaded, { type: "clear" })).toMatchObject({ photoUrl: null, mode: "render" });
    expect(reduceCompare({ ...loaded, guides: "thirds" }, { type: "reset" })).toEqual(initialCompareState);
  });

  it("solo acepta archivos de imagen", () => {
    expect(isImageFile({ type: "image/jpeg" })).toBe(true);
    expect(isImageFile({ type: "application/pdf" })).toBe(false);
    expect(isImageFile({ type: "" })).toBe(false);
  });
});

describe("comparador de referencia: revocacion del object URL", () => {
  it("revoca el URL anterior al cargar otra foto y el actual al liberar", () => {
    let n = 0;
    const api = { createObjectURL: vi.fn(() => `blob:local/${++n}`), revokeObjectURL: vi.fn() };
    const slot = createPhotoSlot(api);
    expect(slot.set(new Blob(["a"]))).toBe("blob:local/1");
    expect(api.revokeObjectURL).not.toHaveBeenCalled();
    expect(slot.set(new Blob(["b"]))).toBe("blob:local/2");
    expect(api.revokeObjectURL).toHaveBeenCalledWith("blob:local/1");
    slot.release();
    expect(api.revokeObjectURL).toHaveBeenCalledWith("blob:local/2");
    expect(slot.current).toBeNull();
    slot.release();
    expect(api.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

describe("comparador de referencia: encuadre 1:1 y guias", () => {
  it("el letterbox es cuadrado y centrado", () => {
    expect(letterboxRect(1000, 560)).toEqual({ x: 220, y: 0, size: 560 });
    expect(letterboxRect(390, 700)).toEqual({ x: 0, y: 155, size: 390 });
    expect(letterboxRect(0, 100).size).toBe(0);
    expect(letterboxRect(Number.NaN, 100).size).toBe(0);
  });

  it("el objetivo proyecta al centro del cuadro", () => {
    const v = presetView("reference", BOX, BOX, { fovDeg: 35, aspect: 1 });
    const c = projectToFrame(v.target, v.position, v.target, 35, 1)!;
    expect(c[0]).toBeCloseTo(0.5, 6);
    expect(c[1]).toBeCloseTo(0.5, 6);
  });

  it("la silueta cabe en el cuadro de referencia y tiene arista cercana", () => {
    const sil = referenceSilhouette(BOX);
    expect(sil.hull.length).toBeGreaterThanOrEqual(5);
    // El encuadre de la especificacion (90 m, objetivo a 18,5 m) deja la base casi al borde del cuadro.
    for (const [x, y] of sil.hull) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      expect(y).toBeGreaterThan(-0.05);
      expect(y).toBeLessThan(1.1);
    }
    expect(sil.nearEdge).not.toBeNull();
  });

  it("la envolvente convexa descarta puntos interiores", () => {
    expect(convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toHaveLength(4);
  });
});
