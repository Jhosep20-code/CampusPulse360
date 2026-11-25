import { useCallback, useEffect, useReducer, useRef } from "react";
import { TOUR_IDLE, reduceTour, type TourEvent, type TourState, type TourStep } from "./tour";

/** Paso del temporizador: el avance usa tiempo real transcurrido (performance.now), no los FPS. */
const TICK_MS = 200;

export interface GuidedTour {
  state: TourState;
  step: TourStep | null;
  play: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
}

/**
 * Temporizador del recorrido guiado. apply(step) se llama UNA vez al entrar en cada paso (incluido el primero).
 * Se pausa solo con la pestana oculta (visibilitychange) y respeta prefers-reduced-motion en la duracion.
 */
export function useGuidedTour(steps: readonly TourStep[], apply: (step: TourStep) => void, reducedMotion: boolean): GuidedTour {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const [state, dispatch] = useReducer((s: TourState, e: TourEvent) => reduceTour(s, e, stepsRef.current, reducedRef.current), TOUR_IDLE);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Aplica el paso al entrar en el (cambio de indice o arranque/reinicio).
  const applied = useRef<string>("");
  useEffect(() => {
    if (state.status === "idle") {
      applied.current = "";
      return;
    }
    const key = `${state.index}:${state.status === "playing" || state.status === "paused" ? "on" : ""}`;
    const step = stepsRef.current[state.index];
    if (step && applied.current !== key) {
      applied.current = key;
      applyRef.current(step);
    }
  }, [state.index, state.status]);

  // Reinicio con el mismo indice 0: fuerza volver a aplicar el primer paso.
  const restart = useCallback(() => {
    applied.current = "";
    dispatch({ type: "restart" });
  }, []);

  useEffect(() => {
    if (state.status !== "playing") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (!document.hidden) dispatch({ type: "elapsed", ms: dt });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  return {
    state,
    step: state.status === "idle" ? null : (steps[state.index] ?? null),
    play: useCallback(() => {
      applied.current = "";
      dispatch({ type: "play" });
    }, []),
    pause: useCallback(() => dispatch({ type: "pause" }), []),
    resume: useCallback(() => dispatch({ type: "resume" }), []),
    restart,
    stop: useCallback(() => dispatch({ type: "stop" }), []),
    setSpeed: useCallback((speed: number) => dispatch({ type: "speed", speed }), []),
  };
}
