import type { AiProviderName } from "@campuspulse/contracts";
import type { Env } from "../env";
import { utcDay } from "../lib/ids";
import { getProvider } from "./provider";

export interface AiUsage {
  provider: AiProviderName;
  model: string;
  calls_today: number;
  daily_limit: number;
  est_neurons_today: number;
}

/**
 * Neuronas estimadas de @cf/openai/gpt-oss-20b (precios oficiales de Workers AI
 * verificados el 21-nov-2026): 18182 neuronas por millon de tokens de entrada y
 * 27273 por millon de tokens de salida. Es una ESTIMACION local para vigilar el
 * cupo gratuito (10.000 neuronas/dia); la cifra oficial esta en el panel de Cloudflare.
 */
export const NEURONS_PER_M_INPUT = 18182;
export const NEURONS_PER_M_OUTPUT = 27273;

export function estimateNeurons(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * NEURONS_PER_M_INPUT + (outputTokens / 1e6) * NEURONS_PER_M_OUTPUT;
}

export function dailyLimit(env: Env): number {
  const n = Number.parseInt(env.AI_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n >= 0 ? n : 60;
}

export async function getAiUsage(env: Env, now: number): Promise<AiUsage> {
  const row = await env.DB.prepare("SELECT calls, est_neurons FROM ai_quota WHERE day = ?1")
    .bind(utcDay(now))
    .first<{ calls: number; est_neurons: number }>();
  const p = getProvider(env);
  return {
    provider: p?.name ?? "rules-fallback",
    model: p?.model ?? "rules-v1",
    calls_today: row?.calls ?? 0,
    daily_limit: dailyLimit(env),
    est_neurons_today: Math.round((row?.est_neurons ?? 0) * 100) / 100,
  };
}

/**
 * Reserva atomica de una llamada de IA: un unico UPSERT que solo incrementa si
 * calls < limite. Devuelve false si el cupo diario esta agotado.
 */
export async function reserveAiCall(env: Env, now: number): Promise<boolean> {
  const limit = dailyLimit(env);
  if (limit <= 0) return false;
  const res = await env.DB.prepare(
    `INSERT INTO ai_quota (day, calls, est_neurons) VALUES (?1, 1, 0)
     ON CONFLICT(day) DO UPDATE SET calls = calls + 1 WHERE calls < ?2`,
  )
    .bind(utcDay(now), limit)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function recordAiUsage(env: Env, now: number, inTok: number, outTok: number): Promise<void> {
  const neurons = estimateNeurons(Math.max(0, inTok), Math.max(0, outTok));
  await env.DB.prepare(
    `INSERT INTO ai_quota (day, calls, est_neurons) VALUES (?1, 0, ?2)
     ON CONFLICT(day) DO UPDATE SET est_neurons = est_neurons + ?2`,
  )
    .bind(utcDay(now), neurons)
    .run();
}
