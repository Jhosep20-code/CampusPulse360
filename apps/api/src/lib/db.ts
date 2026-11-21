import type { Context } from "hono";
import type { Env } from "../env";

export interface SessionUser {
  id: string;
  name: string;
  role: "admin" | "operator";
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser | null };
};
export type AppContext = Context<AppEnv>;

export const OPEN_STATUSES_SQL = "('pending_ai','open','acknowledged')";
export const DAY_MS = 86_400_000;

export function clientIp(c: AppContext): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

export function safeJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
