import { AiDiagnosis } from "@campuspulse/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { assistantChat } from "../src/ai/chat";
import { buildDiagnoseMessages, parseDiagnosis, type DiagnoseContext } from "../src/ai/prompts/diagnose.v1";
import { MockProvider } from "../src/ai/provider";
import { rulesFallbackDiagnosis } from "../src/engine/rules-fallback";
import dataset from "../eval/dataset.json";
import { judge, type ChatCase } from "../eval/run";
import { E, NOW, putReadings, reset } from "./engine-helpers";

const DEVICES = ["DEV_1_LOBBY", "DEV_1_BIB", "DEV_2_A201", "DEV_2_A202", "DEV_3_A301", "DEV_3_LAB1", "DEV_4_A401", "DEV_4_LAB2", "DEV_5_AUD", "DEV_5_OFI"];

describe("eval: dataset de diagnostico (reglas y mock, sin red)", () => {
  it("tiene 10 casos de diagnostico y 20 preguntas", () => {
    expect(dataset.diagnosis).toHaveLength(10);
    expect(dataset.chat).toHaveLength(20);
  });

  it("rules-fallback y MockProvider aciertan severidad y causa, y producen JSON valido", async () => {
    for (const c of dataset.diagnosis) {
      const ctx = c.context as unknown as DiagnoseContext;
      const fb = rulesFallbackDiagnosis(ctx);
      expect(AiDiagnosis.safeParse(fb).success, c.id).toBe(true);
      expect(fb.severidad, c.id).toBe(c.expected.severidad);
      for (const kw of c.expected.causa_keywords) {
        expect((fb.causa_probable + fb.acciones.join(" ")).toLowerCase(), c.id).toContain(kw);
      }
      const m = await new MockProvider().complete(buildDiagnoseMessages(ctx), { maxTokens: 100 });
      const p = parseDiagnosis(m.text);
      expect(p.ok, c.id).toBe(true);
      // evidencia real: todos los valores citados salen del contexto
      for (const e of fb.evidencia) {
        const s = ctx.readings.summary[e.metric];
        expect(s?.last, c.id).toBeCloseTo(e.valor, 1);
      }
    }
  });
});

describe("eval: preguntas del asistente con MockProvider (mide el contrato, no la calidad de un LLM)", () => {
  beforeEach(async () => {
    await reset();
    for (const d of DEVICES) await putReadings(d, Array.from({ length: 180 }, (_, i) => ({ ts: NOW - (179 - i) * 60_000 })));
  });

  it("alcanza al menos 90 % de aciertos", async () => {
    let pass = 0;
    const fails: string[] = [];
    for (const c of dataset.chat as ChatCase[]) {
      const r = await assistantChat(E, { message: c.question, history: [] }, NOW);
      if (judge(c, r).pass) pass++;
      else fails.push(c.id);
    }
    console.log(`eval chat mock: ${pass}/${dataset.chat.length} fallos=${fails.join(",") || "ninguno"}`);
    expect(pass / dataset.chat.length).toBeGreaterThanOrEqual(0.9);
  });
});
