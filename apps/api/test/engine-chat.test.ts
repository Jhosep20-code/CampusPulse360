import { ChatResponse } from "@campuspulse/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { assistantChat } from "../src/ai/chat";
import { runTool } from "../src/ai/tools";
import type { AIProvider } from "../src/ai/types";
import { count, E, NOW, putReadings, putSustained, reset } from "./engine-helpers";

const DEVICES = ["DEV_1_LOBBY", "DEV_1_BIB", "DEV_2_A201", "DEV_2_A202", "DEV_3_A301", "DEV_3_LAB1", "DEV_4_A401", "DEV_4_LAB2", "DEV_5_AUD", "DEV_5_OFI"];

async function seed(): Promise<void> {
  await reset();
  for (const d of DEVICES) await putReadings(d, [{ ts: NOW - 60_000 }, { ts: NOW }]);
  // A301 saturada y con CO2 critico
  await putSustained("DEV_3_A301", NOW, 5, { co2: 1700, occ: 52, temp: 26 });
}

const ask = (message: string, env = E, deps?: Parameters<typeof assistantChat>[3]) =>
  assistantChat(env, { message, history: [] }, NOW, deps);

describe("assistantChat", () => {
  beforeEach(seed);

  it("con mock devuelve un ChatResponse valido con citas existentes y accion focus_spaces", async () => {
    const r = await ask("¿Qué espacios están en riesgo?");
    expect(ChatResponse.safeParse(r).success).toBe(true);
    expect(r.meta).toMatchObject({ provider: "mock", mode: "live" });
    expect(r.citations).toContain("SPC_3_A301");
    const ids = new Set((await E.DB.prepare("SELECT id FROM spaces").all<{ id: string }>()).results.map((x) => x.id));
    expect(r.citations.every((c) => ids.has(c))).toBe(true);
    expect(r.actions).toEqual([{ type: "focus_spaces", ids: expect.arrayContaining(["SPC_3_A301"]) }]);
    expect(r.answer).toContain("simulados");
    const row = await E.DB.prepare("SELECT prompt_id, mode, valid_json FROM ai_outputs").first<{ prompt_id: string; mode: string; valid_json: number }>();
    expect(row).toEqual({ prompt_id: "assistant", mode: "live", valid_json: 1 });
    expect(await count("SELECT calls AS n FROM ai_quota")).toBe(2); // eleccion + redaccion
  });

  it("cada herramienta responde una pregunta distinta con respuestas validas", async () => {
    for (const q of [
      "Dame un resumen del campus",
      "¿Cómo está el aula A301?",
      "¿Hay incidencias abiertas?",
      "Pronóstico de CO2 para A301",
      "Busca el laboratorio de IoT",
    ]) {
      const r = await ask(q);
      expect(ChatResponse.safeParse(r).success, q).toBe(true);
      expect(r.meta.mode).toBe("live");
    }
  });

  it("filtra citas y ids a espacios que existen", async () => {
    const p: AIProvider = {
      name: "workers-ai",
      model: "fake",
      complete: async (_m, opts) =>
        opts.tools
          ? { text: "", toolCalls: [{ name: "get_campus_status", arguments: {} }], latencyMs: 1 }
          : {
              text: '```json\n{"answer":"Todo bien (datos simulados)","citations":["SPC_3_A301","SPC_9_FAKE"],"focus_space_ids":["SPC_9_FAKE"]}\n```',
              latencyMs: 1,
              usage: { input_tokens: 100, output_tokens: 20 },
            },
    };
    const r = await ask("estado", E, { provider: p });
    expect(r.citations).toEqual(["SPC_3_A301"]);
    expect(r.actions).toEqual([{ type: "focus_spaces", ids: ["SPC_3_A301"] }]);
    expect(r.meta.provider).toBe("workers-ai");
  });

  it("si el modelo no soporta tool calls usa el enrutado por JSON", async () => {
    const stages: string[] = [];
    const p: AIProvider = {
      name: "workers-ai",
      model: "fake",
      complete: async (msgs, opts) => {
        const sys = msgs[0]?.content ?? "";
        if (opts.tools) {
          stages.push("tools");
          return { text: "no puedo llamar herramientas", latencyMs: 1 };
        }
        if (sys.includes("assistant-router")) {
          stages.push("router");
          return { text: '{"tool":"get_open_incidents","args":{}}', latencyMs: 1 };
        }
        stages.push("answer");
        return { text: '{"answer":"Sin incidencias activas (datos simulados)","citations":[],"focus_space_ids":[]}', latencyMs: 1 };
      },
    };
    const r = await ask("¿hay algo abierto?", E, { provider: p });
    expect(stages).toEqual(["tools", "router", "answer"]);
    expect(r.meta.mode).toBe("live");
    expect(r.actions).toEqual([]);
  });

  it("sin proveedor o sin cupo responde en modo fallback con list_spaces_at_risk y lo indica", async () => {
    const noProvider = await ask("¿Qué pasa?", { ...E, AI_PROVIDER: "workers-ai", AI: undefined });
    expect(ChatResponse.safeParse(noProvider).success).toBe(true);
    expect(noProvider.meta).toMatchObject({ provider: "rules-fallback", mode: "fallback", latency_ms: null });
    expect(noProvider.answer).toContain("no está disponible");
    expect(noProvider.citations).toContain("SPC_3_A301");

    const noQuota = await ask("¿Qué pasa?", { ...E, AI_DAILY_LIMIT: "0" });
    expect(noQuota.meta.mode).toBe("fallback");
    expect(noQuota.actions[0]?.ids).toContain("SPC_3_A301");
    expect(await count("SELECT COUNT(*) AS n FROM ai_outputs WHERE mode = 'fallback' AND prompt_id = 'assistant'")).toBe(2);
  });

  it("respuesta invalida del modelo degrada a fallback y registra valid_json=0", async () => {
    const p: AIProvider = {
      name: "workers-ai",
      model: "fake",
      complete: async (_m, opts) =>
        opts.tools ? { text: "", toolCalls: [{ name: "list_spaces_at_risk", arguments: {} }], latencyMs: 1 } : { text: "no es json", latencyMs: 1 },
    };
    const r = await ask("riesgo", E, { provider: p });
    expect(r.meta.mode).toBe("fallback");
    expect(await count("SELECT COUNT(*) AS n FROM ai_outputs WHERE valid_json = 0")).toBe(1);
  });
});

describe("herramientas de solo lectura", () => {
  beforeEach(seed);

  it("resuelven espacios por id, codigo o nombre y no aceptan SQL", async () => {
    const a = await runTool(E, "get_space_status", { space_id: "A301" }, NOW);
    expect(a.result).toMatchObject({ found: true, space_id: "SPC_3_A301", status: "critical" });
    const b = await runTool(E, "get_space_status", { space_id: "SPC_3_A301'; DROP TABLE spaces;--" }, NOW);
    expect(b.result).toMatchObject({ found: false });
    expect(await count("SELECT COUNT(*) AS n FROM spaces")).toBe(10);
    const unknown = await runTool(E, "drop_everything", {}, NOW);
    expect(unknown.name).toBe("get_campus_status");
    const piso = await runTool(E, "find_spaces", { query: "piso 3" }, NOW);
    expect((piso.result.spaces as Array<{ space_id: string }>).map((s) => s.space_id).sort()).toEqual(["SPC_3_A301", "SPC_3_LAB1"]);
  });
});
