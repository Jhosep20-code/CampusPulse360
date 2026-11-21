import { Hono } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { SessionInfo } from "@campuspulse/contracts";
import { audit, auditStmt } from "../lib/audit";
import { clientIp, type AppEnv } from "../lib/db";
import { fromBase64Url, sha256Hex, timingSafeEqualStr, toBase64Url } from "../lib/hmac";
import { newId } from "../lib/ids";
import { HttpError } from "../lib/problem";
import { rateLimit } from "../lib/rate-limit";
import { jsonBody } from "../lib/validate";
import { SESSION_COOKIE, clearSessionCookie, loadUser, newSession, setSessionCookie } from "./session";

const CHALLENGE_TTL_MS = 5 * 60_000;
const enc = new TextEncoder();

const RegisterOptionsBody = z.object({
  bootstrap_token: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(64),
  role: z.enum(["admin", "operator"]),
});

/** Respuesta WebAuthn: se valida la forma externa; el detalle lo verifica la libreria. */
const WebAuthnResponse = z.looseObject({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  response: z.looseObject({}),
});
const VerifyBody = z.object({
  challenge_id: z.string().min(1).max(128),
  response: WebAuthnResponse,
});

interface ChallengeRow {
  id: string;
  challenge: string;
  kind: string;
  user_id: string | null;
  role: string | null;
  user_name: string | null;
  expires_at: number;
}

/** Consume el desafio (un solo uso, atomico). */
async function consumeChallenge(db: D1Database, id: string, kind: "register" | "login", now: number) {
  const row = await db
    .prepare("DELETE FROM auth_challenges WHERE id = ? AND kind = ? RETURNING id, challenge, kind, user_id, role, user_name, expires_at")
    .bind(id, kind)
    .first<ChallengeRow>();
  if (!row || row.expires_at < now) throw new HttpError(400, "Desafio invalido o expirado");
  return row;
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.use("/passkey/*", rateLimit("auth", 10));

/* ------------------------------------------------------------- registro */

authRoutes.post("/passkey/register/options", async (c) => {
  const body = await jsonBody(c, RegisterOptionsBody);
  const expected = c.env.BOOTSTRAP_TOKEN;
  // Comparacion en tiempo constante; mismo mensaje si falta el secreto o no coincide.
  if (!expected || !(await timingSafeEqualStr(body.bootstrap_token, expected))) {
    throw new HttpError(403, "Token de arranque invalido");
  }
  const tokenHash = await sha256Hex(body.bootstrap_token);
  const used = await c.env.DB.prepare("SELECT used_at FROM bootstrap_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ used_at: number | null }>();
  if (used && used.used_at !== null) throw new HttpError(403, "Token de arranque ya utilizado");

  const now = Date.now();
  const userId = newId("usr");
  const options = await generateRegistrationOptions({
    rpName: c.env.WEBAUTHN_RP_NAME,
    rpID: c.env.WEBAUTHN_RP_ID,
    userName: body.name,
    userID: new Uint8Array(enc.encode(userId)),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = newId("chl");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    c.env.DB.prepare(
      "INSERT INTO auth_challenges (id, challenge, kind, user_id, role, user_name, expires_at) VALUES (?, ?, 'register', ?, ?, ?, ?)",
    ).bind(challengeId, options.challenge, userId, body.role, JSON.stringify({ name: body.name, th: tokenHash }), now + CHALLENGE_TTL_MS),
  ]);
  return c.json({ challenge_id: challengeId, options });
});

authRoutes.post("/passkey/register/verify", async (c) => {
  const body = await jsonBody(c, VerifyBody, 32 * 1024);
  const now = Date.now();
  const ch = await consumeChallenge(c.env.DB, body.challenge_id, "register", now);
  const meta = safeParseMeta(ch.user_name);
  if (!ch.user_id || !meta || (ch.role !== "admin" && ch.role !== "operator")) {
    throw new HttpError(400, "Desafio invalido o expirado");
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as unknown as RegistrationResponseJSON,
      expectedChallenge: ch.challenge,
      expectedOrigin: c.env.WEBAUTHN_ORIGIN,
      expectedRPID: c.env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });
  } catch {
    throw new HttpError(400, "No se pudo verificar la passkey");
  }
  if (!verification.verified) throw new HttpError(400, "No se pudo verificar la passkey");
  const cred = verification.registrationInfo.credential;

  const dup = await c.env.DB.prepare("SELECT 1 AS x FROM passkeys WHERE credential_id = ?").bind(cred.id).first();
  if (dup) throw new HttpError(409, "La credencial ya esta registrada");

  // Reclama el token de un solo uso: falla si otra peticion lo uso antes (carrera).
  const claim = await c.env.DB.prepare(
    `INSERT INTO bootstrap_tokens (token_hash, role, expires_at, used_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (token_hash) DO UPDATE SET used_at = excluded.used_at, role = excluded.role
     WHERE bootstrap_tokens.used_at IS NULL`,
  )
    .bind(meta.th, ch.role, now, now)
    .run();
  if (claim.meta.changes !== 1) throw new HttpError(403, "Token de arranque ya utilizado");

  const session = await newSession(c.env, ch.user_id, now);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)").bind(ch.user_id, meta.name, ch.role, now),
    c.env.DB.prepare(
      "INSERT INTO passkeys (credential_id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(cred.id, ch.user_id, toBase64Url(cred.publicKey), cred.counter, cred.transports ? JSON.stringify(cred.transports) : null, now),
    session.stmt,
    auditStmt(c.env.DB, now, ch.user_id, "user.register", ch.user_id, { role: ch.role, name: meta.name }),
  ]);
  setSessionCookie(c, session.token);
  const info: SessionInfo = { authenticated: true, role: ch.role, name: meta.name };
  return c.json(info);
});

function safeParseMeta(s: string | null): { name: string; th: string } | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as { name?: unknown; th?: unknown };
    return typeof v.name === "string" && typeof v.th === "string" ? { name: v.name, th: v.th } : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- login */

authRoutes.post("/passkey/login/options", async (c) => {
  const now = Date.now();
  const options = await generateAuthenticationOptions({
    rpID: c.env.WEBAUTHN_RP_ID,
    userVerification: "required",
  });
  const challengeId = newId("chl");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    c.env.DB.prepare("INSERT INTO auth_challenges (id, challenge, kind, expires_at) VALUES (?, ?, 'login', ?)").bind(
      challengeId,
      options.challenge,
      now + CHALLENGE_TTL_MS,
    ),
  ]);
  return c.json({ challenge_id: challengeId, options });
});

authRoutes.post("/passkey/login/verify", async (c) => {
  const body = await jsonBody(c, VerifyBody, 32 * 1024);
  const now = Date.now();
  const ch = await consumeChallenge(c.env.DB, body.challenge_id, "login", now);
  const credId = body.response.id;
  const row = await c.env.DB.prepare(
    `SELECT p.credential_id, p.public_key, p.counter, p.transports, u.id AS user_id, u.name, u.role
     FROM passkeys p JOIN users u ON u.id = p.user_id WHERE p.credential_id = ?`,
  )
    .bind(credId)
    .first<{
      credential_id: string;
      public_key: string;
      counter: number;
      transports: string | null;
      user_id: string;
      name: string;
      role: "admin" | "operator";
    }>();

  const fail = async (): Promise<never> => {
    await audit(c.env.DB, now, "anonymous", "auth.login_failed", credId.slice(0, 32), { ip: clientIp(c) });
    throw new HttpError(401, "Credencial no valida");
  };
  if (!row) return fail();

  let transports: string[] | undefined;
  try {
    const t = row.transports ? (JSON.parse(row.transports) as unknown) : undefined;
    if (Array.isArray(t)) transports = t.filter((x): x is string => typeof x === "string");
  } catch {
    transports = undefined;
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: ch.challenge,
      expectedOrigin: c.env.WEBAUTHN_ORIGIN,
      expectedRPID: c.env.WEBAUTHN_RP_ID,
      credential: {
        id: row.credential_id,
        publicKey: fromBase64Url(row.public_key),
        counter: row.counter,
        ...(transports ? { transports } : {}),
      },
      requireUserVerification: true,
    });
  } catch {
    return fail();
  }
  if (!verification.verified) return fail();

  const session = await newSession(c.env, row.user_id, now);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE passkeys SET counter = ? WHERE credential_id = ?").bind(
      verification.authenticationInfo.newCounter,
      row.credential_id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    session.stmt,
    auditStmt(c.env.DB, now, row.user_id, "auth.login", row.user_id, { ip: clientIp(c) }),
  ]);
  setSessionCookie(c, session.token);
  const info: SessionInfo = { authenticated: true, role: row.role, name: row.name };
  return c.json(info);
});

/* ------------------------------------------------------- sesion y logout */

authRoutes.post("/logout", async (c) => {
  const user = await loadUser(c);
  const token = getCookie(c, SESSION_COOKIE);
  const now = Date.now();
  if (token) {
    const stmts = [c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token))];
    if (user) stmts.push(auditStmt(c.env.DB, now, user.id, "auth.logout", user.id));
    await c.env.DB.batch(stmts);
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/session", async (c) => {
  const user = await loadUser(c);
  const info: SessionInfo = user
    ? { authenticated: true, role: user.role, name: user.name }
    : { authenticated: false, role: "visitor", name: null };
  return c.json(info);
});
