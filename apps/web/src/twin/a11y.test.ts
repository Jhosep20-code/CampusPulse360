import { describe, expect, it } from "vitest";
import type { LiveSnapshot } from "@campuspulse/contracts";
import { describeSpaces, describeTwin } from "./a11y";
import { DEFAULT_DIMS } from "./constants";
import { estimateBudget } from "./budget";
import { makeCampus, liveSpace } from "./fixtures";

function snapshot(): LiveSnapshot {
  return {
    generated_at: 1_800_000_000_000,
    simulated: true,
    kpis: {
      spaces_total: 10, spaces_ok: 8, spaces_warning: 0, spaces_critical: 1, spaces_offline: 1,
      occupancy_total: 0, capacity_total: 0, avg_co2_ppm: null, avg_temp_c: null, power_total_w: null, open_incidents: 0,
    },
    spaces: [
      liveSpace("critical", { co2_ppm: 1700 }, "SPC_3_A301"),
      liveSpace("ok", {}, "SPC_3_LAB1"),
    ],
  };
}

describe("describeTwin", () => {
  it("resume el estado del campus", () => {
    const text = describeTwin(makeCampus(), snapshot(), "status", true);
    expect(text).toContain("Gemelo digital: 10 espacios");
    expect(text).toContain("1 crítico");
    expect(text).toContain("8 sin conexión"); // 8 espacios sin lectura en la instantanea de prueba
    expect(text).toContain("Datos simulados");
    expect(text).toContain("geometría provisional");
  });
  it("indica carga cuando no hay datos en vivo", () => {
    expect(describeTwin(makeCampus(), null, "co2", false)).toContain("cargando");
  });
});

describe("describeSpaces", () => {
  it("lista todos los espacios con su estado", () => {
    const list = describeSpaces(makeCampus(), snapshot(), "co2");
    expect(list).toHaveLength(10);
    const a301 = list.find((l) => l.id === "SPC_3_A301");
    expect(a301?.text).toContain("Crítico");
    expect(a301?.text).toContain("1700 ppm");
  });
});

describe("estimateBudget", () => {
  it("mantiene los draw calls estimados bajo el presupuesto de 60", () => {
    const b = estimateBudget(makeCampus(), DEFAULT_DIMS);
    console.log("[estimacion analitica]", JSON.stringify(b));
    expect(b.drawCallsDay).toBeLessThan(60);
    expect(b.drawCallsNight).toBeLessThan(60);
    expect(b.drawCallsPeak).toBeLessThan(60);
    expect(b.trianglesMain).toBeLessThan(120_000);
  });
});
