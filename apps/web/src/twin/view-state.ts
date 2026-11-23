import type { TwinPresetId } from "./view";

/**
 * Máquina de estados de la vista del gemelo (función pura y testeable).
 *
 * Estado: preset de cámara (Fachada / Aérea / Atrio / Referencia), piso aislado
 * (P1–P10 o null), pisos explotados, modo datos y modo noche.
 *
 * Reglas de compatibilidad:
 *  - Referencia: modelo COMPLETO para comparar con una foto. Al entrar se limpian el
 *    aislamiento, la explosión y el modo datos. Aislar, explotar o activar el modo datos
 *    estando en Referencia sale de Referencia (a Fachada).
 *  - Atrio (corte de sección): muestra todos los pisos cortados. Al entrar se limpian el
 *    aislamiento y la explosión. Aislar o explotar estando en Atrio sale a Fachada.
 *  - Aislar un piso: solo ese nivel es visible (los demás no se dibujan) y se ve su
 *    interior. Es compatible con Fachada y Aérea, con datos y con noche.
 *  - Explotar: compatible con Fachada, Aérea, aislamiento, datos y noche.
 *  - Noche: compatible con todo.
 *  - Restablecer: Fachada, sin aislamiento, sin explosión y sin modo datos (la noche se
 *    conserva porque es una preferencia explícita del usuario).
 */
export interface ViewState {
  preset: TwinPresetId;
  isolatedLevel: number | null;
  exploded: boolean;
  dataMode: boolean;
  night: boolean;
}

export type ViewAction =
  | { type: "preset"; id: TwinPresetId }
  | { type: "isolate"; level: number | null }
  | { type: "explode"; on: boolean }
  | { type: "data"; on: boolean }
  | { type: "night"; on: boolean }
  | { type: "reset" };

export const INITIAL_VIEW: ViewState = {
  preset: "facade",
  isolatedLevel: null,
  exploded: false,
  dataMode: false,
  night: false,
};

/** Presets que requieren el modelo completo (sin aislar ni explotar). */
const FULL_MODEL_PRESETS: ReadonlySet<TwinPresetId> = new Set<TwinPresetId>(["reference", "atrium"]);

export function reduceView(s: ViewState, a: ViewAction): ViewState {
  switch (a.type) {
    case "preset":
      if (a.id === "reference") return { ...s, preset: "reference", isolatedLevel: null, exploded: false, dataMode: false };
      if (a.id === "atrium") return { ...s, preset: "atrium", isolatedLevel: null, exploded: false };
      return { ...s, preset: a.id };
    case "isolate":
      if (a.level === null) return { ...s, isolatedLevel: null };
      return { ...s, isolatedLevel: a.level, preset: FULL_MODEL_PRESETS.has(s.preset) ? "facade" : s.preset };
    case "explode":
      if (!a.on) return { ...s, exploded: false };
      return { ...s, exploded: true, preset: FULL_MODEL_PRESETS.has(s.preset) ? "facade" : s.preset };
    case "data":
      return { ...s, dataMode: a.on, preset: a.on && s.preset === "reference" ? "facade" : s.preset };
    case "night":
      return { ...s, night: a.on };
    case "reset":
      return { ...INITIAL_VIEW, night: s.night };
  }
}

/** Interior visible (fachada translúcida): modo datos, corte del Atrio o un piso aislado. */
export function interiorVisible(s: ViewState): boolean {
  return s.dataMode || s.preset === "atrium" || s.isolatedLevel !== null;
}

/** Invariantes que nunca deben romperse (útil en pruebas). */
export function isCoherent(s: ViewState): boolean {
  if (s.preset === "reference" && (s.isolatedLevel !== null || s.exploded || s.dataMode)) return false;
  if (s.preset === "atrium" && (s.isolatedLevel !== null || s.exploded)) return false;
  return true;
}
