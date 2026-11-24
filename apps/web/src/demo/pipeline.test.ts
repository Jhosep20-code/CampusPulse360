import type { BotRun, CustomScenarioResponse, Incident, LiveSpace } from "@campuspulse/contracts";
import { describe, expect, it } from "vitest";
import { pipelineSettled, pipelineSteps } from "./pipeline";

const T = 1_900_000_000_000;
const launch: CustomScenarioResponse = {
  space_id: "SPC_2_A201",
  device_id: "DEV_2_A201",
  kind: "co2",
  level: "critical",
  started_at: T,
  until: T + 8 * 60_000,
  inserted: 6,
  profile: { co2_ppm: 1720, temp_c: 23, rh_pct: 50, occupancy: 38, power_w: 1400 },
  expected_rules: [
    { id: "RULE_CO2_CRIT", name: "CO2 critico", severity: "critical" },
    { id: "RULE_CO2_HIGH", name: "CO2 elevado sostenido", severity: "warning" },
  ],
};
const liveOk: LiveSpace = { space_id: "SPC_2_A201", mesh_id: "SPC_2_A201", status: "ok", last_ts: T - 120_000, source: "sim", metrics: { co2_ppm: 600, temp_c: 22, rh_pct: 45, occupancy: 10, power_w: 900 } };
const liveCrit: LiveSpace = { ...liveOk, status: "critical", last_ts: T, source: "sim-scenario", metrics: launch.profile! };
const run: BotRun = { id: "run_1", bot: "incident-bot", started_at: T + 30_000, finished_at: T + 31_000, status: "success", summary: "reglas=6; nuevas=1" };
const inc = (over: Partial<Incident> = {}): Incident => ({
  id: "inc_1",
  space_id: "SPC_2_A201",
  rule_id: "RULE_CO2_CRIT",
  title: "CO2 critico",
  status: "pending_ai",
  severity: "critical",
  opened_at: T + 30_000,
  closed_at: null,
  diagnosis: null,
  diagnosis_meta: null,
  ...over,
});

const state = (steps: ReturnType<typeof pipelineSteps>) => Object.fromEntries(steps.map((s) => [s.id, s.state]));

describe("pasos verificables de la demostracion", () => {
  it("justo tras lanzar: solo API y reglas confirmadas; el resto pendiente (no se inventa nada)", () => {
    const s = pipelineSteps({ launch, live: liveOk, botRuns: [], incidents: [] });
    expect(state(s)).toEqual({ sensor: "pending", api: "done", rules: "done", bot: "pending", incident: "pending", ai: "pending", twin: "pending" });
    expect(pipelineSettled(s)).toBe(false);
  });

  it("ejecuciones o incidencias ANTERIORES al lanzamiento no cuentan", () => {
    const old = { ...run, started_at: T - 60_000 };
    const s = pipelineSteps({ launch, live: liveCrit, botRuns: [old], incidents: [inc({ opened_at: T - 120_000 })] });
    expect(state(s).bot).toBe("pending");
    expect(state(s).incident).toBe("pending");
  });

  it("cadena completa con IA real", () => {
    const meta = { provider: "workers-ai" as const, model: "@cf/openai/gpt-oss-20b", mode: "live" as const, created_at: T + 60_000, latency_ms: 1800 };
    const diag = { causa_probable: "Ventilacion insuficiente", severidad: "critical" as const, acciones: ["Ventilar"], evidencia: [], confianza: 0.8 };
    const s = pipelineSteps({ launch, live: liveCrit, botRuns: [run], incidents: [inc({ status: "open", diagnosis: diag, diagnosis_meta: meta })] });
    expect(state(s)).toEqual({ sensor: "done", api: "done", rules: "done", bot: "done", incident: "done", ai: "done", twin: "done" });
    expect(s.find((x) => x.id === "ai")!.detail).toContain("@cf/openai/gpt-oss-20b");
    // Severidades en espanol y la regla que abre la incidencia (la mas severa) primero.
    expect(s.find((x) => x.id === "rules")!.detail).toBe("CO2 critico (crítica) · CO2 elevado sostenido (advertencia)");
    expect(s.find((x) => x.id === "incident")!.detail).toContain("· crítica ·");
    expect(s.find((x) => x.id === "twin")!.detail).toBe("Estado del espacio: crítico.");
    expect(pipelineSettled(s)).toBe(true);
  });

  it("si el diagnostico vino del respaldo por reglas, se marca como aviso y lo dice", () => {
    const meta = { provider: "rules-fallback" as const, model: "rules-v1", mode: "fallback" as const, created_at: T + 60_000, latency_ms: null };
    const s = pipelineSteps({ launch, live: liveCrit, botRuns: [run], incidents: [inc({ diagnosis_meta: meta })] });
    const ai = s.find((x) => x.id === "ai")!;
    expect(ai.state).toBe("warn");
    expect(ai.detail).toContain("sin IA");
  });

  it("desconexion: sin reglas ni IA; el gemelo se confirma cuando /live dice offline", () => {
    const off: CustomScenarioResponse = { ...launch, kind: "offline", inserted: 0, profile: null, expected_rules: [] };
    let s = pipelineSteps({ launch: off, live: liveOk, botRuns: [run], incidents: [] });
    expect(state(s)).toMatchObject({ sensor: "done", api: "skipped", rules: "skipped", bot: "skipped", incident: "skipped", ai: "skipped", twin: "pending" });
    s = pipelineSteps({ launch: off, live: { ...liveOk, status: "offline" }, botRuns: [run], incidents: [] });
    expect(state(s).twin).toBe("done");
    expect(pipelineSettled(s)).toBe(true);
  });
});
