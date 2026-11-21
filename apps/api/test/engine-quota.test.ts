import { beforeEach, describe, expect, it } from "vitest";
import { getProvider } from "../src/ai/provider";
import { estimateNeurons, getAiUsage, recordAiUsage, reserveAiCall } from "../src/ai/quota";
import { E, NOW, reset } from "./engine-helpers";

describe("cuota de IA", () => {
  beforeEach(reset);

  it("reserveAiCall respeta AI_DAILY_LIMIT=60: la llamada 61 es false", async () => {
    expect(E.AI_DAILY_LIMIT).toBe("60");
    for (let i = 1; i <= 60; i++) expect(await reserveAiCall(E, NOW)).toBe(true);
    expect(await reserveAiCall(E, NOW)).toBe(false);
    expect((await getAiUsage(E, NOW)).calls_today).toBe(60);
    // al dia siguiente (UTC) se reinicia
    expect(await reserveAiCall(E, NOW + 86_400_000)).toBe(true);
  });

  it("reservas concurrentes no superan el limite", async () => {
    const env2 = { ...E, AI_DAILY_LIMIT: "5" };
    const res = await Promise.all(Array.from({ length: 12 }, () => reserveAiCall(env2, NOW)));
    expect(res.filter(Boolean)).toHaveLength(5);
  });

  it("limite 0 siempre es false; recordAiUsage acumula neuronas estimadas", async () => {
    expect(await reserveAiCall({ ...E, AI_DAILY_LIMIT: "0" }, NOW)).toBe(false);
    await recordAiUsage(E, NOW, 1_000_000, 1_000_000);
    await recordAiUsage(E, NOW, 0, 0);
    const u = await getAiUsage(E, NOW);
    expect(u.est_neurons_today).toBeCloseTo(18182 + 27273, 0);
    expect(estimateNeurons(1000, 500)).toBeCloseTo(18.182 + 13.6365, 3);
    expect(u).toMatchObject({ provider: "mock", daily_limit: 60 });
  });

  it("getProvider: workers-ai sin binding AI y openai sin clave devuelven null", () => {
    expect(getProvider(E)?.name).toBe("mock");
    expect(getProvider({ ...E, AI_PROVIDER: "workers-ai", AI: undefined })).toBeNull();
    expect(getProvider({ ...E, AI_PROVIDER: "openai", OPENAI_API_KEY: undefined })).toBeNull();
    expect(getProvider({ ...E, AI_PROVIDER: "openai", OPENAI_API_KEY: "k" })?.name).toBe("openai");
  });
});
