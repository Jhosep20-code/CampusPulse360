import { beforeEach, describe, expect, it } from "vitest";
import { buildDiagnoseMessages, parseDiagnosis, type DiagnoseContext } from "../src/ai/prompts/diagnose.v1";
import { MockProvider } from "../src/ai/provider";
import type { AIProvider } from "../src/ai/types";
import { diagnoseIncident } from "../src/engine/diagnose";
import { count, E, insertIncident, NOW, putSustained, reset } from "./engine-helpers";

const garbage = (): AIProvider & { calls: number } => ({
  name: "workers-ai",
  model: "garbage-model",
  calls: 0,
  async complete() {
    this.calls++;
    return { text: "esto no es json {{ malformado", latencyMs: 3, usage: { input_tokens: 10, output_tokens: 5 } };
  },
});

describe("parseDiagnosis", () => {
  it("JSON malformado devuelve error", () => {
    expect(parseDiagnosis("{causa_probable: sin comillas")).toMatchObject({ ok: false });
    expect(parseDiagnosis("sin json")).toMatchObject({ ok: false });
    expect(parseDiagnosis('{"causa_probable":"x"}').ok).toBe(false);
  });

  it("acepta JSON dentro de bloques de codigo y normaliza severidad y valor", () => {
    const txt =
      'Claro:\n```json\n{"causa_probable":"Ventilacion insuficiente","severidad":"Critical","acciones":["Abrir ventanas"],"evidencia":[{"device_id":"DEV_3_A301","metric":"co2_ppm","valor":"1700"}],"confianza":0.8}\n```';
    const p = parseDiagnosis(txt);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.severidad).toBe("critical");
      expect(p.value.evidencia[0]?.valor).toBe(1700);
    }
  });
});

describe("diagnoseIncident", () => {
  beforeEach(async () => {
    await reset();
    await putSustained("DEV_3_A301", NOW, 10, { co2: 1700, occ: 52, temp: 26 });
    await insertIncident("inc_t1", "SPC_3_A301", "RULE_CO2_CRIT", NOW);
  });

  it("proveedor que siempre devuelve basura termina en fallback tras 1 reintento", async () => {
    const p = garbage();
    const r = await diagnoseIncident(E, "inc_t1", { now: NOW, provider: p });
    expect(p.calls).toBe(2);
    expect(r.meta).toMatchObject({ provider: "rules-fallback", mode: "fallback", latency_ms: null });
    expect(r.diagnosis.confianza).toBe(0.5);
    expect(r.diagnosis.evidencia.find((e) => e.metric === "co2_ppm")?.valor).toBe(1700);
    const inc = await E.DB.prepare("SELECT status, ai_output_id FROM incidents WHERE id = 'inc_t1'").first<{
      status: string;
      ai_output_id: string;
    }>();
    expect(inc?.status).toBe("open");
    const fb = await E.DB.prepare("SELECT mode, valid_json, provider FROM ai_outputs WHERE id = ?1")
      .bind(inc?.ai_output_id)
      .first<{ mode: string; valid_json: number; provider: string }>();
    expect(fb).toMatchObject({ mode: "fallback", valid_json: 1, provider: "rules-fallback" });
    // traza del intento en vivo invalido y consumo de cupo de ambos intentos
    expect(await count("SELECT COUNT(*) AS n FROM ai_outputs WHERE valid_json = 0 AND mode = 'live'")).toBe(1);
    expect(await count("SELECT calls AS n FROM ai_quota")).toBe(2);
  });

  it("un proveedor que lanza excepcion tambien termina en fallback", async () => {
    const p: AIProvider = {
      name: "workers-ai",
      model: "m",
      complete: async () => {
        throw new Error("caido");
      },
    };
    const r = await diagnoseIncident(E, "inc_t1", { now: NOW, provider: p });
    expect(r.meta.mode).toBe("fallback");
  });

  it("reintenta una vez con el error y acepta la segunda respuesta valida", async () => {
    const ctx: DiagnoseContext = {
      simulated: true,
      now_lima: "x",
      incident: { id: "i", title: "t", severity: "critical", opened_at: NOW },
      space: { id: "SPC_3_A301", name: "Aula A301", type: "classroom", level: 3, capacity: 45 },
      rule: { id: "RULE_CO2_CRIT", name: "CO2", metric: "co2_ppm", op: ">=", threshold: 1500, sustain_s: 60, severity: "critical" },
      device_id: "DEV_3_A301",
      readings: { n: 1, window_min: 30, summary: { co2_ppm: { min: 1, max: 2, last: 3 } } },
      history: [],
    };
    const good = await new MockProvider().complete(buildDiagnoseMessages(ctx), { maxTokens: 100 });
    let n = 0;
    const seen: string[] = [];
    const p: AIProvider = {
      name: "workers-ai",
      model: "m",
      complete: async (msgs) => {
        seen.push(msgs[msgs.length - 1]?.content ?? "");
        return { text: n++ === 0 ? "basura" : good.text, latencyMs: 5 };
      },
    };
    const r = await diagnoseIncident(E, "inc_t1", { now: NOW, provider: p });
    expect(r.meta.mode).toBe("live");
    expect(seen[1]).toContain("no fue válida");
  });

  it("MockProvider: guarda ai_output valido, pasa a open y la segunda llamada es cached", async () => {
    const r1 = await diagnoseIncident(E, "inc_t1", { now: NOW });
    expect(r1.meta).toMatchObject({ provider: "mock", mode: "live" });
    const r2 = await diagnoseIncident(E, "inc_t1", { now: NOW + 1000 });
    expect(r2.meta.mode).toBe("cached");
    expect(r2.diagnosis).toEqual(r1.diagnosis);
    expect(await count("SELECT COUNT(*) AS n FROM ai_outputs")).toBe(1);
    const r3 = await diagnoseIncident(E, "inc_t1", { now: NOW + 2000, force: true });
    expect(r3.meta.mode).toBe("live");
    expect(await count("SELECT COUNT(*) AS n FROM ai_outputs")).toBe(2);
  });

  it("sin proveedor (null) usa reglas y una incidencia inexistente lanza error", async () => {
    const r = await diagnoseIncident(E, "inc_t1", { now: NOW, provider: null });
    expect(r.meta.provider).toBe("rules-fallback");
    await expect(diagnoseIncident(E, "inc_nope", { now: NOW })).rejects.toThrow("incident_not_found");
  });
});
