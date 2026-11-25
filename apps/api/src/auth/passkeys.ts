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
/** Vigencia del codigo para vincular otro dispositivo a la MISMA cuenta. */
export const LINK_CODE_TTL_MS = 10 * 60_000;
/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L): 31 simbolos x 10 = ~49 bits; un solo uso, 10 min y rate limit. */
const LINK_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LINK_LEN = 10;

export function newLinkCode(): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < LINK_LEN) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < 248) out.push(LINK_ALPHABET[v % 31]!); // rechazo para no sesgar (248 = 8 x 31)
  }
  return out.join("");
}

/** Normaliza lo que escribe la persona: mayusculas, sin espacios ni guiones. */
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

const LinkOptionsBody = z.object({ code: z.string().trim().min(LINK_LEN).max(32) });

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

  if (meta.lh !== undefined) {
    // Vinculacion: el codigo se reclama de forma atomica y solo para la cuenta a la que pertenece.
    const link = await c.env.DB.prepare(
      "UPDATE link_codes SET used_at = ? WHERE code_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at >= ?",
    )
      .bind(now, meta.lh, ch.user_id, now)
      .run();
    if (link.meta.changes !== 1) throw new HttpError(403, "Codigo de vinculacion invalido, usado o caducado");
    const owner = await c.env.DB.prepare("SELECT name, role FROM users WHERE id = ?").bind(ch.user_id).first<{
      name: string;
      role: "admin" | "operator";
    }>();
    if (!owner) throw new HttpError(403, "Codigo de vinculacion invalido, usado o caducado");
    const linked = await newSession(c.env, ch.user_id, now);
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO passkeys (credential_id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(cred.id, ch.user_id, toBase64Url(cred.publicKey), cred.counter, cred.transports ? JSON.stringify(cred.transports) : null, now),
      linked.stmt,
      auditStmt(c.env.DB, now, ch.user_id, "user.passkey_linked", ch.user_id, { ip: clientIp(c) }),
    ]);
    setSessionCookie(c, linked.token);
    const out: SessionInfo = { authenticated: true, role: owner.role, name: owner.name };
    return c.json(out);
  }

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

/** th = hash del token de arranque (alta de cuenta nueva); lh = hash del codigo de vinculacion (cuenta existente). */
type ChallengeMeta = { name: string; th: string; lh?: undefined } | { name: string; lh: string; th?: undefined };

function safeParseMeta(s: string | null): ChallengeMeta | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as { name?: unknown; th?: unknown; lh?: unknown };
    if (typeof v.name !== "string") return null;
    if (typeof v.th === "string" && v.lh === undefined) return { name: v.name, th: v.th };
    if (typeof v.lh === "string" && v.th === undefined) return { name: v.name, lh: v.lh };
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------- vincular otro dispositivo */

/** Una persona con sesion genera un codigo para registrar una passkey en OTRO dispositivo, en SU propia cuenta. */
authRoutes.post("/passkey/link/code", async (c) => {
  const user = await loadUser(c);
  if (!user) throw new HttpError(401, "Inicie sesion para continuar");
  const now = Date.now();
  const code = newLinkCode();
  const expiresAt = now + LINK_CODE_TTL_MS;
  await c.env.DB.batch([
    // Un codigo vigente por cuenta: generar otro invalida los anteriores sin usar.
    c.env.DB.prepare("DELETE FROM link_codes WHERE user_id = ? AND used_at IS NULL").bind(user.id),
    c.env.DB.prepare("DELETE FROM link_codes WHERE expires_at < ?").bind(now - 86_400_000),
    c.env.DB.prepare("INSERT INTO link_codes (code_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)").bind(
      await sha256Hex(code),
      user.id,
      expiresAt,
      now,
    ),
    auditStmt(c.env.DB, now, user.id, "auth.link_code", user.id, { ip: clientIp(c) }),
  ]);
  return c.json({ code, expires_at: expiresAt });
});

/** Opciones de registro para vincular este dispositivo a la cuenta duena del codigo (sin crear usuarios ni roles). */
authRoutes.post("/passkey/link/options", async (c) => {
  const body = await jsonBody(c, LinkOptionsBody);
  const now = Date.now();
  const hash = await sha256Hex(normalizeLinkCode(body.code));
  const row = await c.env.DB.prepare(
    `SELECT l.user_id, u.name, u.role FROM link_codes l JOIN users u ON u.id = l.user_id
     WHERE l.code_hash = ? AND l.used_at IS NULL AND l.expires_at >= ?`,
  )
    .bind(hash, now)
    .first<{ user_id: string; name: string; role: "admin" | "operator" }>();
  if (!row) throw new HttpError(403, "Codigo de vinculacion invalido, usado o caducado");
  const existing = await c.env.DB.prepare("SELECT credential_id FROM passkeys WHERE user_id = ?")
    .bind(row.user_id)
    .all<{ credential_id: string }>();
  const options = await generateRegistrationOptions({
    rpName: c.env.WEBAUTHN_RP_NAME,
    rpID: c.env.WEBAUTHN_RP_ID,
    userName: row.name,
    userID: new Uint8Array(enc.encode(row.user_id)),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: existing.results.map((r) => ({ id: r.credential_id })),
  });
  const challengeId = newId("chl");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    c.env.DB.prepare(
      "INSERT INTO auth_challenges (id, challenge, kind, user_id, role, user_name, expires_at) VALUES (?, ?, 'register', ?, ?, ?, ?)",
    ).bind(challengeId, options.challenge, row.user_id, row.role, JSON.stringify({ name: row.name, lh: hash }), now + CHALLENGE_TTL_MS),
  ]);
  return c.json({ challenge_id: challengeId, options });
});

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
