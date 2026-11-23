import type { CampusResponse } from "@campuspulse/contracts";
import type { BuildingDims } from "./constants";
import { BATCH_KEYS, BATCH_META, buildBuilding, type BatchKey } from "./facade";
import { computeLayout } from "./layout";
import { profileSettings, type Profile } from "./profile";

/**
 * Estimacion ANALITICA del coste de render, calculada con la misma geometria que
 * dibuja CampusTwin (no es una medicion con renderer.info). Sirve de guardia en
 * pruebas: presupuesto objetivo <= 60 draw calls y < 40k triangulos.
 */
export interface RenderBudget {
  profile: Profile;
  floors: number;
  spaces: number;
  /** Instancias por material (clave -> cantidad), solo materiales con instancias. */
  instances: Partial<Record<BatchKey, number>>;
  windowPanes: number;
  /** InstancedMesh del edificio y el entorno (una por material usado). */
  batchDrawCalls: number;
  /** Draw calls fijos: cielo, suelo, cerros, ventanas nocturnas, volumenes de espacio, contornos. */
  fixedDrawCalls: number;
  /** Peor caso del pase principal: modo datos (interior) + noche + 2 contornos. */
  drawCallsMain: number;
  /** Pase de sombras (solo perfil alto): mallas con castShadow. */
  drawCallsShadowPass: number;
  /** Peor caso total: principal + sombras. */
  drawCallsPeak: number;
  trianglesMain: number;
  trianglesShadowPass: number;
}

const BOX_TRIS = 12;
const PLANE_TRIS = 2;
const SKY_TRIS = 24 * 16 * 2;
const GROUND_TRIS = 64;
const HILL_TRIS = 96 * 2;

export function estimateBudget(
  campus: CampusResponse,
  dims: BuildingDims,
  profile: Profile = "high",
): RenderBudget {
  const layout = computeLayout(campus, dims, false);
  const settings = profileSettings(profile);
  const building = buildBuilding(dims, layout, settings.context);
  const instances: Partial<Record<BatchKey, number>> = {};
  let boxTris = 0;
  let batchDrawCalls = 0;
  let shadowCalls = 0;
  let shadowTris = 0;
  for (const k of BATCH_KEYS) {
    const count = building.boxes[k].length;
    if (count === 0) continue;
    instances[k] = count;
    batchDrawCalls++;
    boxTris += count * BOX_TRIS;
    if (BATCH_META[k].shadow) {
      shadowCalls++;
      shadowTris += count * BOX_TRIS;
    }
  }
  const spaces = layout.spaces.length;
  const windows = building.windows.length;
  // cielo + suelo + cerros + ventanas + volumenes SPC + 2 contornos (seleccion y hover)
  const fixed = 1 + 1 + 1 + (windows > 0 ? 1 : 0) + spaces + 2;
  const drawCallsMain = batchDrawCalls + fixed;
  const shadowPass = settings.shadows ? shadowCalls : 0;
  return {
    profile,
    floors: layout.floors.length,
    spaces,
    instances,
    windowPanes: windows,
    batchDrawCalls,
    fixedDrawCalls: fixed,
    drawCallsMain,
    drawCallsShadowPass: shadowPass,
    drawCallsPeak: drawCallsMain + shadowPass,
    trianglesMain:
      boxTris + windows * PLANE_TRIS + spaces * BOX_TRIS + 2 * 12 + SKY_TRIS + GROUND_TRIS + HILL_TRIS,
    trianglesShadowPass: settings.shadows ? shadowTris : 0,
  };
}
