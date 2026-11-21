import { Hono } from "hono";
import { AiProviderName, type SystemInfo } from "@campuspulse/contracts";
import type { AppEnv } from "../lib/db";
import { getAiUsage } from "../ai/quota";

export const systemRoutes = new Hono<AppEnv>();

systemRoutes.get("/system/health", async (c) => {
  let db = false;
  try {
    const r = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    db = r?.ok === 1;
  } catch (err) {
    console.error("health: fallo de D1", err);
  }
  const ai = c.env.AI_PROVIDER === "mock" || !c.env.AI ? "fallback" : "available";
  return c.json(
    { status: db ? "ok" : "degraded", checks: { db, ai }, time: Date.now() },
    db ? 200 : 503,
  );
});

systemRoutes.get("/system/info", async (c) => {
  const env = c.env;
  const provider = AiProviderName.safeParse(env.AI_PROVIDER);
  let ai: SystemInfo["ai"] = {
    provider: provider.success ? provider.data : "rules-fallback",
    model: env.AI_MODEL,
    calls_today: 0,
    daily_limit: Number.parseInt(env.AI_DAILY_LIMIT, 10) || 0,
    est_neurons_today: 0,
  };
  try {
    ai = await getAiUsage(env, Date.now());
  } catch (err) {
    console.error("system/info: getAiUsage fallo; se usan valores por defecto", err);
  }
  const info: SystemInfo = {
    name: "CampusPulse 360",
    version: env.APP_VERSION,
    commit: env.GIT_COMMIT,
    environment: env.ENVIRONMENT,
    ai,
    telemetry_simulated: true,
  };
  return c.json(info);
});
