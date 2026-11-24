/*
 * Maquina de estados de la colocacion en WebXR (nivel A), sin three ni DOM para poder probarla.
 *
 * Por que existe: los resultados de hit-test SOLO estan disponibles en los fotogramas de animacion
 * (requestAnimationFrame de la sesion). El XRFrame de un evento "select" NO trae resultados, asi que leerlos
 * alli devolvia siempre una lista vacia: el aro cian se veia (habia superficie) pero al tocar aparecia
 * "Aun no hay superficie detectada". Ahora el toque solo PIDE colocar y la colocacion ocurre en el siguiente
 * fotograma de animacion que tenga superficie.
 */

export type SurfaceState = "searching" | "found" | "placed";

export interface PlacementState {
  surface: SurfaceState;
  /** Instante (ms) del toque pendiente de colocar, o null. */
  pendingSince: number | null;
}

export const INITIAL_PLACEMENT: PlacementState = { surface: "searching", pendingSince: null };

/** Tiempo maximo que un toque espera a que aparezca superficie antes de descartarse. */
export const PENDING_TTL_MS = 4000;

export const STATUS = {
  searching: "Buscando superficie… Mueve el teléfono despacio sobre la mesa (con textura y buena luz) hasta que aparezca el aro cian.",
  found: "Superficie detectada: toca la pantalla para colocar la maqueta sobre el aro cian.",
  waiting: "Toque recibido: colocando en cuanto se detecte la superficie…",
  expired: "No se detectó superficie a tiempo. Acerca el teléfono a la mesa, muévelo despacio y vuelve a tocar cuando veas el aro cian.",
  placed: "Maqueta colocada. Toca un espacio para ver sus datos o usa «Recolocar».",
} as const;

export type PlacementAction = { place: boolean; status: string | null; showReticle: boolean };

/** El usuario toco la pantalla (evento select) mientras la maqueta no estaba colocada. */
export function onTap(s: PlacementState, now: number): { state: PlacementState; status: string | null } {
  if (s.surface === "placed") return { state: s, status: null };
  return { state: { ...s, pendingSince: now }, status: s.surface === "found" ? null : STATUS.waiting };
}

/**
 * Un fotograma de animacion. hasHit = hay resultado de hit-test con pose en ESTE fotograma.
 * Devuelve si hay que colocar ahora (con el hit de este fotograma), el nuevo estado y el mensaje (solo si cambia).
 */
export function onFrame(s: PlacementState, hasHit: boolean, now: number): { state: PlacementState } & PlacementAction {
  if (s.surface === "placed") return { state: s, place: false, status: null, showReticle: false };
  if (hasHit && s.pendingSince !== null) {
    return { state: { surface: "placed", pendingSince: null }, place: true, status: STATUS.placed, showReticle: false };
  }
  let pendingSince = s.pendingSince;
  let status: string | null = null;
  if (pendingSince !== null && now - pendingSince > PENDING_TTL_MS) {
    pendingSince = null;
    status = STATUS.expired;
  }
  const surface: SurfaceState = hasHit ? "found" : "searching";
  if (surface !== s.surface && status === null) status = pendingSince !== null && !hasHit ? STATUS.waiting : STATUS[surface];
  return { state: { surface, pendingSince }, place: false, status, showReticle: hasHit };
}

/** Recolocar: vuelve a buscar superficie. */
export function onReset(): { state: PlacementState; status: string } {
  return { state: INITIAL_PLACEMENT, status: STATUS.searching };
}
