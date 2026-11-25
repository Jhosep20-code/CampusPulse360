/**
 * Perfil de calidad del gemelo. Funcion pura (recibe matchMedia) para probarla sin DOM.
 * Perfil "low" (movil): sin sombras dinamicas, DPR <= 1,5 y sin contexto urbano denso.
 */
export type QualityProp = "auto" | "high" | "low";
export type Profile = "high" | "low";

export const DPR_HIGH: [number, number] = [1, 2];
export const DPR_LOW: [number, number] = [1, 1.5];

type MatchMediaFn = (query: string) => { matches: boolean };

export function isSmallOrTouch(mm: MatchMediaFn | undefined): boolean {
  if (!mm) return false;
  return mm("(max-width: 820px)").matches || mm("(pointer: coarse)").matches;
}

export function resolveProfile(quality: QualityProp, mm?: MatchMediaFn): Profile {
  if (quality === "low") return "low";
  if (quality === "high") return "high";
  return isSmallOrTouch(mm) ? "low" : "high";
}

export interface ProfileSettings {
  shadows: boolean;
  dpr: [number, number];
  context: "sparse" | "dense";
  envResolution: number;
  shadowMapSize: number;
}

export function profileSettings(p: Profile): ProfileSettings {
  return p === "low"
    ? { shadows: false, dpr: DPR_LOW, context: "sparse", envResolution: 128, shadowMapSize: 512 }
    : { shadows: true, dpr: DPR_HIGH, context: "dense", envResolution: 256, shadowMapSize: 2048 };
}
