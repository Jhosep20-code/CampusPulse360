import { describe, expect, it } from "vitest";
import { INITIAL_VIEW, interiorVisible, isCoherent, reduceView, type ViewAction, type ViewState } from "./view-state";

const run = (actions: ViewAction[], from: ViewState = INITIAL_VIEW) => actions.reduce(reduceView, from);

describe("maquina de estados de la vista del gemelo", () => {
  it("Referencia muestra el modelo completo sin aislamiento residual", () => {
    const s = run([{ type: "isolate", level: 6 }, { type: "explode", on: true }, { type: "data", on: true }, { type: "preset", id: "reference" }]);
    expect(s).toMatchObject({ preset: "reference", isolatedLevel: null, exploded: false, dataMode: false });
  });

  it("aislar o explotar estando en Atrio o Referencia sale a Fachada", () => {
    expect(run([{ type: "preset", id: "atrium" }, { type: "isolate", level: 9 }])).toMatchObject({ preset: "facade", isolatedLevel: 9 });
    expect(run([{ type: "preset", id: "reference" }, { type: "explode", on: true }])).toMatchObject({ preset: "facade", exploded: true });
  });

  it("restablecer limpia todo salvo la noche", () => {
    const s = run([{ type: "night", on: true }, { type: "isolate", level: 9 }, { type: "explode", on: true }, { type: "reset" }]);
    expect(s).toEqual({ ...INITIAL_VIEW, night: true });
  });

  it("secuencias pedidas mantienen invariantes", () => {
    const seqs: ViewAction[][] = [
      [{ type: "isolate", level: 6 }, { type: "preset", id: "atrium" }, { type: "preset", id: "facade" }, { type: "preset", id: "reference" }],
      [{ type: "isolate", level: 9 }, { type: "explode", on: true }, { type: "explode", on: false }, { type: "reset" }],
      [{ type: "isolate", level: 1 }, { type: "isolate", level: 5 }, { type: "isolate", level: 10 }, { type: "isolate", level: null }],
      [{ type: "preset", id: "atrium" }, { type: "night", on: true }, { type: "night", on: false }, { type: "preset", id: "facade" }],
    ];
    for (const seq of seqs) {
      let s = INITIAL_VIEW;
      for (const a of seq) {
        s = reduceView(s, a);
        expect(isCoherent(s), JSON.stringify({ a, s })).toBe(true);
      }
    }
  });

  it("el interior se ve en datos, atrio o piso aislado", () => {
    expect(interiorVisible(INITIAL_VIEW)).toBe(false);
    expect(interiorVisible(run([{ type: "isolate", level: 3 }]))).toBe(true);
    expect(interiorVisible(run([{ type: "preset", id: "atrium" }]))).toBe(true);
  });
});
