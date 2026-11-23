import { describe, expect, it } from "vitest";
import { DPR_LOW, profileSettings, resolveProfile } from "./profile";

const mm = (small: boolean, coarse: boolean) => (q: string) => ({
  matches: q.includes("max-width") ? small : q.includes("coarse") ? coarse : false,
});

describe("perfil de calidad", () => {
  it("auto en pantalla pequena o tactil usa el perfil movil", () => {
    expect(resolveProfile("auto", mm(true, false))).toBe("low");
    expect(resolveProfile("auto", mm(false, true))).toBe("low");
    expect(resolveProfile("auto", mm(false, false))).toBe("high");
    expect(resolveProfile("auto", undefined)).toBe("high");
  });

  it("quality explicito manda sobre la deteccion", () => {
    expect(resolveProfile("low", mm(false, false))).toBe("low");
    expect(resolveProfile("high", mm(true, true))).toBe("high");
  });

  it("el perfil movil no tiene sombras, limita el DPR a 1,5 y reduce el contexto", () => {
    const low = profileSettings("low");
    expect(low.shadows).toBe(false);
    expect(low.dpr[1]).toBeLessThanOrEqual(1.5);
    expect(low.dpr).toEqual(DPR_LOW);
    expect(low.context).toBe("sparse");
    const high = profileSettings("high");
    expect(high.shadows).toBe(true);
    expect(high.context).toBe("dense");
  });
});
