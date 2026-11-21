import type { BuildingDims } from "./constants";
import type { SpaceBox } from "./layout";

/**
 * Elementos de fachada y cubierta de la geometria PROCEDURAL provisional.
 * Funciones puras que devuelven cajas (centro + tamano) en coordenadas locales
 * al origen del piso. Todas las medidas derivan de las ESTIMACIONES de constants.ts.
 */

export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface WindowPane {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** +1 = fachada sur (mira a +Z), -1 = fachada norte (mira a -Z). */
  facing: 1 | -1;
}

/** Montantes verticales y franjas horizontales del muro cortina de UN piso. */
export function buildFrameBoxes(dims: BuildingDims): Box[] {
  const { footprintW: W, footprintD: D, floorHeight, slab, mullionPitch, spandrelH } = dims;
  const H = floorHeight - slab;
  const yc = slab + H / 2;
  const boxes: Box[] = [];

  const nx = Math.max(1, Math.round(W / mullionPitch));
  const nz = Math.max(1, Math.round(D / mullionPitch));
  for (let i = 0; i <= nx; i++) {
    const x = -W / 2 + (i * W) / nx;
    boxes.push({ x, y: yc, z: D / 2, sx: 0.12, sy: H, sz: 0.2 });
    boxes.push({ x, y: yc, z: -D / 2, sx: 0.12, sy: H, sz: 0.2 });
  }
  for (let j = 1; j < nz; j++) {
    const z = -D / 2 + (j * D) / nz;
    boxes.push({ x: W / 2, y: yc, z, sx: 0.2, sy: H, sz: 0.12 });
    boxes.push({ x: -W / 2, y: yc, z, sx: 0.2, sy: H, sz: 0.12 });
  }

  // Antepecho opaco, travesano intermedio y cabezal: una franja por fachada.
  const bands: Array<{ y: number; h: number; t: number }> = [
    { y: slab + spandrelH / 2, h: spandrelH, t: 0.14 },
    { y: slab + spandrelH + 1.0, h: 0.07, t: 0.14 },
    { y: floorHeight - 0.08, h: 0.16, t: 0.14 },
  ];
  for (const b of bands) {
    boxes.push({ x: 0, y: b.y, z: D / 2, sx: W, sy: b.h, sz: b.t });
    boxes.push({ x: 0, y: b.y, z: -D / 2, sx: W, sy: b.h, sz: b.t });
    boxes.push({ x: W / 2, y: b.y, z: 0, sx: b.t, sy: b.h, sz: D });
    boxes.push({ x: -W / 2, y: b.y, z: 0, sx: b.t, sy: b.h, sz: D });
  }
  return boxes;
}

/** Nucleo de circulacion (escaleras/ascensores) de un piso. */
export function coreBox(dims: BuildingDims): Box {
  const h = dims.floorHeight - dims.slab;
  return {
    x: dims.footprintW / 2 - dims.wallInset - dims.coreW / 2,
    y: dims.slab + h / 2,
    z: 0,
    sx: dims.coreW,
    sy: h,
    sz: dims.coreD,
  };
}

/** Parapeto, sobrerrecorrido del nucleo y equipos de cubierta (locales al piso superior). */
export function buildRoofBoxes(dims: BuildingDims): Box[] {
  const { footprintW: W, footprintD: D, floorHeight, slab, parapetH } = dims;
  const top = floorHeight + slab;
  const t = 0.25;
  const core = coreBox(dims);
  return [
    { x: 0, y: top + parapetH / 2, z: D / 2 - t / 2, sx: W, sy: parapetH, sz: t },
    { x: 0, y: top + parapetH / 2, z: -D / 2 + t / 2, sx: W, sy: parapetH, sz: t },
    { x: W / 2 - t / 2, y: top + parapetH / 2, z: 0, sx: t, sy: parapetH, sz: D - 2 * t },
    { x: -W / 2 + t / 2, y: top + parapetH / 2, z: 0, sx: t, sy: parapetH, sz: D - 2 * t },
    // sobrerrecorrido del nucleo
    { x: core.x, y: top + 1.3, z: 0, sx: dims.coreW, sy: 2.6, sz: dims.coreD },
    // equipos de cubierta (volumenes genericos, sin dato real)
    { x: -14, y: top + 0.55, z: -4, sx: 2.6, sy: 1.1, sz: 1.8 },
    { x: -6, y: top + 0.55, z: 4.5, sx: 2.6, sy: 1.1, sz: 1.8 },
    { x: 4, y: top + 0.4, z: -4.5, sx: 1.8, sy: 0.8, sz: 1.4 },
  ];
}

/**
 * Paneles de ventana (solo visibles en modo noche) alineados con los modulos del
 * muro cortina, sobre la fachada del lado de cada espacio.
 */
export function buildWindowPanes(space: SpaceBox, dims: BuildingDims): WindowPane[] {
  const pitch = dims.mullionPitch;
  const nx = Math.max(1, Math.round(dims.footprintW / pitch));
  const bay = dims.footprintW / nx;
  const bottom = dims.slab + dims.spandrelH + 0.2;
  const top = dims.floorHeight - 0.35;
  const facing: 1 | -1 = space.row === 0 ? 1 : -1;
  const panes: WindowPane[] = [];
  const x0 = space.x - space.w / 2;
  const x1 = space.x + space.w / 2;
  for (let i = 0; i < nx; i++) {
    const cx = -dims.footprintW / 2 + (i + 0.5) * bay;
    if (cx - bay / 2 < x0 || cx + bay / 2 > x1) continue;
    panes.push({
      x: cx,
      y: (bottom + top) / 2,
      z: facing * (dims.footprintD / 2 + 0.11),
      w: bay - 0.3,
      h: top - bottom,
      facing,
    });
  }
  return panes;
}
