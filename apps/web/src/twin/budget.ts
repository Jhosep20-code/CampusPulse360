import type { CampusResponse } from "@campuspulse/contracts";
import type { BuildingDims } from "./constants";
import { buildFrameBoxes, buildRoofBoxes, buildWindowPanes } from "./facade";
import { computeLayout } from "./layout";

/**
 * Estimacion ANALITICA del coste de render de la geometria procedural, calculada a
 * partir de las listas de cajas (no es una medicion con renderer.info). Sirve de
 * guardia en pruebas: el presupuesto objetivo es < 60 draw calls.
 */
export interface RenderBudget {
  floors: number;
  spaces: number;
  frameInstancesPerFloor: number;
  windowPanes: number;
  /** Draw calls del pase principal, de dia (incluye hasta 2 contornos de seleccion/hover). */
  drawCallsDay: number;
  /** Idem en modo noche (suma la malla de ventanas de cada piso). */
  drawCallsNight: number;
  /** Draw calls adicionales del pase de sombras (solo perfil alto). */
  drawCallsShadowPass: number;
  /** Peor caso: noche + sombras. */
  drawCallsPeak: number;
  trianglesMain: number;
  trianglesShadowPass: number;
}

const BOX_TRIS = 12;
const GROUND_SEGMENTS = 64;

export function estimateBudget(campus: CampusResponse, dims: BuildingDims): RenderBudget {
  const layout = computeLayout(campus, dims, false);
  const floors = layout.floors.length;
  const spaces = layout.spaces.length;
  const frame = buildFrameBoxes(dims).length;
  const roof = buildRoofBoxes(dims).length;
  const panes = layout.spaces.reduce((n, s) => n + buildWindowPanes(s, dims).length, 0);
  const floorsWithWindows = new Set(layout.spaces.map((s) => s.level)).size;

  const outlines = 2;
  // suelo + rejilla + zocalo
  const fixed = 3;
  // por piso: losa, vidrio, montantes (instanced), nucleo
  const perFloor = 4 * floors;
  // losa de cubierta + parapeto/equipos (instanced)
  const roofCalls = floors > 0 ? 2 : 0;
  const drawCallsDay = fixed + perFloor + spaces + roofCalls + outlines;
  const drawCallsNight = drawCallsDay + floorsWithWindows;
  // casters de sombra: losas (+ cubierta) y nucleos
  const casters = floors > 0 ? 2 * floors + 1 : 0;

  const trianglesMain =
    GROUND_SEGMENTS +
    2 + // rejilla
    BOX_TRIS + // zocalo
    floors * (BOX_TRIS + 2 * BOX_TRIS + frame * BOX_TRIS + BOX_TRIS) +
    spaces * BOX_TRIS +
    (floors > 0 ? BOX_TRIS + roof * BOX_TRIS : 0) +
    panes * 2;

  return {
    floors,
    spaces,
    frameInstancesPerFloor: frame,
    windowPanes: panes,
    drawCallsDay,
    drawCallsNight,
    drawCallsShadowPass: casters,
    drawCallsPeak: drawCallsNight + casters,
    trianglesMain,
    trianglesShadowPass: casters * BOX_TRIS,
  };
}
