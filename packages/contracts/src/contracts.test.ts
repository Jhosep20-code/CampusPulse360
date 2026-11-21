import { describe, expect, it } from "vitest";
import { AiDiagnosis, IngestBatch, MeshId, statusFromMetrics } from "./index";

const base = { co2_ppm: 600, temp_c: 22, rh_pct: 45, occupancy: 10, power_w: 800 };
const now = 1_800_000_000_000;

describe("MeshId", () => {
  it("acepta el contrato SPC_<piso>_<codigo>", () => {
    expect(MeshId.safeParse("SPC_3_A301").success).toBe(true);
  });
  it("rechaza nombres fuera de contrato", () => {
    expect(MeshId.safeParse("aula301").success).toBe(false);
    expect(MeshId.safeParse("SPC_3_a301").success).toBe(false);
  });
});

describe("statusFromMetrics", () => {
  it("ok con valores normales", () => {
    expect(statusFromMetrics(base, 40, now, now)).toBe("ok");
  });
  it("warning y critical por CO2", () => {
    expect(statusFromMetrics({ ...base, co2_ppm: 1100 }, 40, now, now)).toBe("warning");
    expect(statusFromMetrics({ ...base, co2_ppm: 1600 }, 40, now, now)).toBe("critical");
  });
  it("critical por sobreaforo", () => {
    expect(statusFromMetrics({ ...base, occupancy: 50 }, 40, now, now)).toBe("critical");
  });
  it("offline sin lectura reciente", () => {
    expect(statusFromMetrics(base, 40, now - 10 * 60_000, now)).toBe("offline");
    expect(statusFromMetrics(null, 40, null, now)).toBe("offline");
  });
});

describe("IngestBatch", () => {
  it("valida un lote correcto", () => {
    const r = IngestBatch.safeParse({
      gateway_id: "gw-sim-01",
      readings: [{ device_id: "DEV_3_A301", ts: now, ...base }],
    });
    expect(r.success).toBe(true);
  });
  it("rechaza valores fuera de rango", () => {
    const r = IngestBatch.safeParse({
      gateway_id: "gw-sim-01",
      readings: [{ device_id: "DEV_3_A301", ts: now, ...base, rh_pct: 140 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("AiDiagnosis", () => {
  it("exige al menos una accion y confianza 0..1", () => {
    const ok = AiDiagnosis.safeParse({
      causa_probable: "Ventilacion insuficiente con aforo alto",
      severidad: "warning",
      acciones: ["Abrir ventanas"],
      evidencia: [{ device_id: "DEV_3_A301", metric: "co2_ppm", valor: 1320 }],
      confianza: 0.8,
    });
    expect(ok.success).toBe(true);
    const bad = AiDiagnosis.safeParse({
      causa_probable: "x",
      severidad: "warning",
      acciones: [],
      evidencia: [],
      confianza: 2,
    });
    expect(bad.success).toBe(false);
  });
});
