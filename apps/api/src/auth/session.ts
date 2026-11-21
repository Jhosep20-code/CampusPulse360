import type { MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";
import type { AppContext, AppEnv, SessionUser } from "../lib/db";
import { randomToken, sha256Hex } from "../lib/hmac";
import { HttpError } from "../lib/problem";

export const SESSION_COOKIE = "cp_session";
export const SESSION_TTL_S = 8 * 3600;

const LEVEL = { visitor: 0, operator: 1, admin: 2 } as const;
export type MinRole = "operator" | "admin";

/** Crea el token (32 bytes aleatorios) y la sentencia de insercion; en D1 solo queda el hash. */
export async function newSession(
  env: Env,
  userId: string,
  now: number,
): Promise<{ token: string; stmt: D1PreparedStatement }> {
  const token = randomToken(32);
  const idHash = await sha256Hex(token);
  const stmt = env.DB.prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(
    idHash,
    userId,
    now + SESSION_TTL_S * 1000,
    now,
  );
  return { token, stmt };
}

export function setSessionCookie(c: AppContext, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export function clearSessionCookie(c: AppContext): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

/** Resuelve el usuario de la sesion (o null). Cachea el resultado en el contexto. */
export async function loadUser(c: AppContext): Promise<SessionUser | null> {
  const cached = c.get("user");
  if (cached !== undefined) return cached;
  let user: SessionUser | null = null;
  const token = getCookie(c, SESSION_COOKIE);
  if (token && token.length >= 20 && token.length <= 128) {
    const idHash = await sha256Hex(token);
    const row = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ? AND s.expires_at > ?`,
    )
      .bind(idHash, Date.now())
      .first<{ id: string; name: string; role: "admin" | "operator" }>();
    if (row) user = { id: row.id, name: row.name, role: row.role };
  }
  c.set("user", user);
  return user;
}

/** 401 sin sesion, 403 con rol insuficiente. Jerarquia admin > operator > visitor. */
export function requireRole(min: MinRole): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await loadUser(c);
    if (!user) throw new HttpError(401, "Inicie sesion para continuar");
    if (LEVEL[user.role] < LEVEL[min]) throw new HttpError(403, `Se requiere rol ${min}`);
    await next();
  };
}

/** Usuario ya autenticado por requireRole. */
export function currentUser(c: AppContext): SessionUser {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "Inicie sesion para continuar");
  return u;
}
