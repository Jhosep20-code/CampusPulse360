import { describe, expect, it } from "vitest";
import { INITIAL_PLACEMENT, PENDING_TTL_MS, STATUS, onFrame, onReset, onTap } from "./placement";

describe("colocacion WebXR (nivel A)", () => {
  it("regresion: con el aro visible, tocar coloca en el SIGUIENTE fotograma de animacion (no en el del evento)", () => {
    let s = onFrame(INITIAL_PLACEMENT, true, 0);
    expect(s.showReticle).toBe(true);
    expect(s.status).toBe(STATUS.found);
    const tap = onTap(s.state, 10);
    expect(tap.status).toBeNull(); // no se muestra "Aun no hay superficie"
    s = onFrame(tap.state, true, 26);
    expect(s.place).toBe(true);
    expect(s.state.surface).toBe("placed");
    expect(s.status).toBe(STATUS.placed);
  });

  it("tocar sin superficie deja el toque pendiente y coloca cuando aparece el aro", () => {
    const tap = onTap(INITIAL_PLACEMENT, 0);
    expect(tap.status).toBe(STATUS.waiting);
    let s = onFrame(tap.state, false, 500);
    expect(s.place).toBe(false);
    s = onFrame(s.state, true, 900);
    expect(s.place).toBe(true);
  });

  it("un toque pendiente caduca si no aparece superficie y lo explica", () => {
    const tap = onTap(INITIAL_PLACEMENT, 0);
    const s = onFrame(tap.state, false, PENDING_TTL_MS + 1);
    expect(s.place).toBe(false);
    expect(s.state.pendingSince).toBeNull();
    expect(s.status).toBe(STATUS.expired);
    // Luego, al aparecer el aro, NO coloca solo: espera otro toque.
    expect(onFrame(s.state, true, PENDING_TTL_MS + 100).place).toBe(false);
  });

  it("solo anuncia cambios de estado (no repite el mensaje en cada fotograma)", () => {
    let s = onFrame(INITIAL_PLACEMENT, false, 0);
    expect(s.status).toBeNull(); // ya estaba "buscando"
    s = onFrame(s.state, true, 16);
    expect(s.status).toBe(STATUS.found);
    s = onFrame(s.state, true, 32);
    expect(s.status).toBeNull();
    s = onFrame(s.state, false, 48);
    expect(s.status).toBe(STATUS.searching);
  });

  it("colocada, los toques ya no recolocan; Recolocar vuelve a buscar", () => {
    const placed = { surface: "placed" as const, pendingSince: null };
    expect(onTap(placed, 0).state).toBe(placed);
    expect(onFrame(placed, true, 0).place).toBe(false);
    const r = onReset();
    expect(r.state.surface).toBe("searching");
    expect(r.status).toBe(STATUS.searching);
  });
});
