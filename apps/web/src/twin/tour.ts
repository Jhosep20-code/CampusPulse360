import type { ViewAction } from "./view-state";

/*
 * Recorrido guiado del gemelo: una secuencia de acciones de la maquina de estados de la vista (view-state.ts).
 * Las transiciones de camara las hace el visor con sus presets (CameraControls con easing), asi que el recorrido
 * NO mueve la camara por su cuenta ni toca el modelo: nunca atraviesa muros ni deja el edificio fuera de cuadro.
 * Funciones puras y testeables; el temporizador vive en useGuidedTour.
 */

export interface TourStep {
  id: string;
  title: string;
  caption: string;
  /** Tiempo en pantalla a velocidad 1x (ms). */
  holdMs: number;
  actions: ViewAction[];
  /** Selecciona el espacio objetivo (etiqueta y panel de datos). */
  selectTarget?: boolean;
  /** Quita la seleccion. */
  clearSelection?: boolean;
}

export interface TourTarget {
  spaceId: string;
  level: number;
  name: string;
}

export function buildTour(target: TourTarget): TourStep[] {
  return [
    {
      id: "aerial",
      title: "Campus digital",
      caption: "Gemelo de la sede UTP Huancayo: 10 pisos modelados en Blender (representación aproximada).",
      holdMs: 5500,
      actions: [{ type: "reset" }, { type: "preset", id: "aerial" }],
      clearSelection: true,
    },
    {
      id: "facade",
      title: "Fachada e identidad",
      caption: "Muro cortina azul, paño blanco y marca UTP; datos en vivo de 10 sensores simulados.",
      holdMs: 5000,
      actions: [{ type: "preset", id: "facade" }],
    },
    {
      id: "atrium",
      title: "Atrio central",
      caption: "Corte de sección: escaleras en zigzag y muro de ascensores (disposición estimada).",
      holdMs: 6000,
      actions: [{ type: "preset", id: "atrium" }],
    },
    {
      id: "floor",
      title: `Piso P${target.level}`,
      caption: `Se aísla el piso P${target.level}: solo se dibuja ese nivel y su interior.`,
      holdMs: 4500,
      actions: [{ type: "preset", id: "facade" }, { type: "isolate", level: target.level }],
    },
    {
      id: "space",
      title: target.name,
      caption: "Sensores del ambiente: el color y la baliza salen del estado calculado por la API (CO₂, temperatura, aforo, consumo).",
      holdMs: 6500,
      actions: [{ type: "data", on: true }],
      selectTarget: true,
    },
    {
      id: "back",
      title: "Centro de mando",
      caption: "Regreso al edificio completo. Las incidencias las abre el bot del servidor y las diagnostica Workers AI.",
      holdMs: 4000,
      actions: [{ type: "reset" }],
      clearSelection: true,
    },
  ];
}

export type TourStatus = "idle" | "playing" | "paused";

export interface TourState {
  status: TourStatus;
  index: number;
  /** ms restantes del paso actual (a la velocidad elegida). */
  remainingMs: number;
  /** 1 = normal; 0.5 = mitad de velocidad (pasos el doble de largos). */
  speed: number;
}

export const TOUR_IDLE: TourState = { status: "idle", index: 0, remainingMs: 0, speed: 1 };

export type TourEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart" }
  | { type: "stop" }
  | { type: "elapsed"; ms: number }
  | { type: "speed"; speed: number };

/** Duracion efectiva de un paso; con movimiento reducido los pasos duran mas (las transiciones son instantaneas). */
export function stepDuration(step: TourStep, speed: number, reducedMotion: boolean): number {
  return Math.round((step.holdMs * (reducedMotion ? 1.25 : 1)) / Math.max(0.25, speed));
}

export function reduceTour(s: TourState, e: TourEvent, steps: readonly TourStep[], reducedMotion = false): TourState {
  const dur = (i: number, speed = s.speed) => stepDuration(steps[i]!, speed, reducedMotion);
  switch (e.type) {
    case "play":
    case "restart":
      return steps.length ? { ...s, status: "playing", index: 0, remainingMs: dur(0) } : s;
    case "pause":
      return s.status === "playing" ? { ...s, status: "paused" } : s;
    case "resume":
      return s.status === "paused" ? { ...s, status: "playing" } : s;
    case "stop":
      return { ...TOUR_IDLE, speed: s.speed };
    case "speed": {
      if (s.status === "idle") return { ...s, speed: e.speed };
      // Conserva la fraccion restante del paso actual.
      const frac = s.remainingMs / dur(s.index);
      return { ...s, speed: e.speed, remainingMs: Math.round(frac * dur(s.index, e.speed)) };
    }
    case "elapsed": {
      if (s.status !== "playing") return s;
      const left = s.remainingMs - e.ms;
      if (left > 0) return { ...s, remainingMs: left };
      const next = s.index + 1;
      if (next >= steps.length) return { ...TOUR_IDLE, speed: s.speed };
      return { ...s, index: next, remainingMs: dur(next) };
    }
  }
}

/** Elige el espacio del recorrido: el que tenga una alerta; si no, el seleccionado; si no, uno distinto de A301. */
export function pickTourTarget(
  spaces: ReadonlyArray<{ id: string; level: number; name: string; code: string }>,
  statusById: ReadonlyMap<string, string>,
  selectedId: string | null,
): TourTarget | null {
  const alert = spaces.find((s) => statusById.get(s.id) === "critical") ?? spaces.find((s) => statusById.get(s.id) === "warning");
  const chosen = alert ?? spaces.find((s) => s.id === selectedId) ?? spaces.find((s) => s.code === "A201") ?? spaces.find((s) => s.code !== "A301") ?? spaces[0];
  return chosen ? { spaceId: chosen.id, level: chosen.level, name: chosen.name } : null;
}
