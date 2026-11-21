import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { clientIp, type AppEnv } from "./db";
import { HttpError } from "./problem";

const WINDOW_MS = 60_000;

/** Ventana fija por minuto en D1 (tabla rate_limits). */
export async function consume(
  env: Env,
  key: string,
  limit: number,
  now: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  // Limpieza ocasional de ventanas antiguas.
  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 3_600_000).run();
  }
  const retryAfter = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
  return { allowed: (row?.count ?? 1) <= limit, retryAfter };
}

export async function enforceRateLimit(env: Env, key: string, limit: number, now: number): Promise<void> {
  const r = await consume(env, key, limit, now);
  if (!r.allowed) {
    throw new HttpError(429, "Se supero el limite de solicitudes; intente de nuevo mas tarde", {
      headers: { "Retry-After": String(r.retryAfter) },
    });
  }
}

/** Middleware: key = `${bucket}:${ip}`. */
export function rateLimit(bucket: string, limit: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await enforceRateLimit(c.env, `${bucket}:${clientIp(c)}`, limit, Date.now());
    await next();
  };
}
