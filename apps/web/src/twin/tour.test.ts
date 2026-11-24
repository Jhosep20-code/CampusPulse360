import { describe, expect, it } from "vitest";
import { TOUR_IDLE, buildTour, pickTourTarget, reduceTour, stepDuration } from "./tour";
import { INITIAL_VIEW, isCoherent, reduceView, type ViewState } from "./view-state";

const steps = buildTour({ spaceId: "SPC_2_A201", level: 2, name: "Aula A201" });

describe("recorrido guiado", () => {
  it("play -> avanza por tiempo -> termina en idle", () => {
    let s = reduceTour(TOUR_IDLE, { type: "play" }, steps);
    expect(s).toMatchObject({ status: "playing", index: 0 });
    for (let i = 0; i < steps.length; i++) s = reduceTour(s, { type: "elapsed", ms: 1e6 }, steps);
    expect(s.status).toBe("idle");
  });

  it("pausa congela el tiempo y reanudar continua donde estaba", () => {
    let s = reduceTour(TOUR_IDLE, { type: "play" }, steps);
    s = reduceTour(s, { type: "elapsed", ms: 1000 }, steps);
    const left = s.remainingMs;
    s = reduceTour(s, { type: "pause" }, steps);
    s = reduceTour(s, { type: "elapsed", ms: 99999 }, steps);
    expect(s).toMatchObject({ status: "paused", index: 0, remainingMs: left });
    s = reduceTour(s, { type: "resume" }, steps);
    expect(s.status).toBe("playing");
  });

  it("reiniciar vuelve al paso 1; salir deja idle conservando la velocidad", () => {
    let s = reduceTour({ ...TOUR_IDLE, speed: 0.5 }, { type: "play" }, steps);
    s = reduceTour(s, { type: "elapsed", ms: 1e6 }, steps);
    expect(s.index).toBe(1);
    s = reduceTour(s, { type: "restart" }, steps);
    expect(s.index).toBe(0);
    s = reduceTour(s, { type: "stop" }, steps);
    expect(s).toEqual({ ...TOUR_IDLE, speed: 0.5 });
  });

  it("velocidad reducida alarga los pasos y conserva la fraccion restante", () => {
    expect(stepDuration(steps[0]!, 0.5, false)).toBe(steps[0]!.holdMs * 2);
    expect(stepDuration(steps[0]!, 1, true)).toBeGreaterThan(steps[0]!.holdMs);
    let s = reduceTour(TOUR_IDLE, { type: "play" }, steps);
    s = reduceTour(s, { type: "elapsed", ms: steps[0]!.holdMs / 2 }, steps);
    s = reduceTour(s, { type: "speed", speed: 0.5 }, steps);
    expect(s.remainingMs).toBe(steps[0]!.holdMs);
  });

  it("todas las acciones del recorrido dejan la vista en un estado coherente", () => {
    let v: ViewState = INITIAL_VIEW;
    for (const st of steps) {
      for (const a of st.actions) v = reduceView(v, a);
      expect(isCoherent(v)).toBe(true);
    }
    expect(v).toEqual(INITIAL_VIEW);
    // El paso del atrio usa el preset atrium (modelo completo) y el del piso aisla el nivel del objetivo.
    let w: ViewState = INITIAL_VIEW;
    for (const a of steps[3]!.actions) w = reduceView(w, a);
    expect(w).toMatchObject({ preset: "facade", isolatedLevel: 2 });
  });

  it("objetivo: prioriza un espacio en alerta y evita A301 si no hay alertas", () => {
    const sp = [
      { id: "SPC_3_A301", level: 3, name: "Aula A301", code: "A301" },
      { id: "SPC_2_A201", level: 2, name: "Aula A201", code: "A201" },
      { id: "SPC_5_AUD", level: 5, name: "Auditorio", code: "AUD" },
    ];
    expect(pickTourTarget(sp, new Map([["SPC_5_AUD", "critical"]]), null)?.spaceId).toBe("SPC_5_AUD");
    expect(pickTourTarget(sp, new Map(), null)?.spaceId).toBe("SPC_2_A201");
    expect(pickTourTarget(sp, new Map(), "SPC_3_A301")?.spaceId).toBe("SPC_3_A301");
  });
});
