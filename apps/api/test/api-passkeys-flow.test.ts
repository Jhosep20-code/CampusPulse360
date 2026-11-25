import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/lib/hmac";
import { api, sessionCookie } from "./helpers";
import { softLogin, softRegister, type SoftCredential } from "./webauthn-soft";

/*
 * Flujo REAL de passkeys contra el Worker (verificacion de @simplewebauthn/server), con un autenticador de prueba:
 * alta inicial con token de arranque -> inicio de sesion -> vincular un segundo dispositivo con codigo de un solo uso.
 */
const ORIGIN = "http://localhost:5173";
const BOOT = "test-bootstrap-token";
let ipSeq = 0;
const ip = () => ({ "cf-connecting-ip": `198.51.100.${++ipSeq}` });

type Opts = { challenge_id: string; options: { challenge: string; rp: { id: string }; user: { id: string }; excludeCredentials?: { id: string }[] } };

function cookieFrom(res: Response): string {
  const sc = res.headers.get("set-cookie") ?? "";
  const m = /cp_session=([^;]+)/.exec(sc);
  if (!m) throw new Error("sin cookie de sesion");
  return `cp_session=${m[1]}`;
}

async function login(cred: SoftCredential, headers = ip()): Promise<Response> {
  const lo = (await (await api("/auth/passkey/login/options", { method: "POST", json: {}, headers })).json()) as {
    challenge_id: string;
    options: { challenge: string; rpId: string };
  };
  const response = await softLogin(cred, lo.options, ORIGIN);
  return api("/auth/passkey/login/verify", { method: "POST", json: { challenge_id: lo.challenge_id, response }, headers });
}

async function cleanup(userId: string | null) {
  await env.DB.prepare("DELETE FROM bootstrap_tokens WHERE token_hash = ?").bind(await sha256Hex(BOOT)).run();
  if (!userId) return;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM link_codes WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM passkeys WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM audit_log WHERE actor = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

describe("passkeys de punta a punta", () => {
  it("alta inicial (token de un solo uso) -> sesion admin -> login con la passkey; el token no se reutiliza", async () => {
    let userId: string | null = null;
    try {
      const h = ip();
      const o = (await (await api("/auth/passkey/register/options", { method: "POST", headers: h, json: { bootstrap_token: BOOT, name: "Administradora", role: "admin" } })).json()) as Opts;
      expect(o.options.rp.id).toBe("localhost");
      const { response, credential } = await softRegister(o.options, ORIGIN);
      const reg = await api("/auth/passkey/register/verify", { method: "POST", headers: h, json: { challenge_id: o.challenge_id, response } });
      expect(reg.status).toBe(200);
      expect(await reg.json()).toEqual({ authenticated: true, role: "admin", name: "Administradora" });
      const cookie = cookieFrom(reg);
      const u = await env.DB.prepare("SELECT u.id FROM users u JOIN passkeys p ON p.user_id = u.id WHERE u.name = 'Administradora'").first<{ id: string }>();
      userId = u!.id;

      // El desafio era de un solo uso: repetir la verificacion falla (anti-replay).
      const replay = await api("/auth/passkey/register/verify", { method: "POST", headers: h, json: { challenge_id: o.challenge_id, response } });
      expect(replay.status).toBe(400);

      // El token quedo consumido: no sirve para crear otra cuenta (ni admin ni operador).
      const again = await api("/auth/passkey/register/options", { method: "POST", headers: ip(), json: { bootstrap_token: BOOT, name: "Segunda", role: "operator" } });
      expect(again.status).toBe(403);

      const session = (await (await api("/auth/session", { cookie })).json()) as { role: string };
      expect(session.role).toBe("admin");

      const li = await login(credential);
      expect(li.status).toBe(200);
      expect(await li.json()).toEqual({ authenticated: true, role: "admin", name: "Administradora" });
      const counter = await env.DB.prepare("SELECT counter FROM passkeys WHERE user_id = ?").bind(userId).first<{ counter: number }>();
      expect(counter!.counter).toBe(1);
    } finally {
      await cleanup(userId);
    }
  });

  it("login con una passkey que el servidor no conoce -> 401 y queda auditado (no es un fallo de registro)", async () => {
    const o = { challenge: "x", rp: { id: "localhost" }, user: { id: "dXNyX2Zha2U" } };
    const { credential } = await softRegister(o, ORIGIN); // credencial nunca registrada en el servidor
    const res = await login(credential);
    expect(res.status).toBe(401);
    const row = await env.DB.prepare("SELECT 1 AS x FROM audit_log WHERE action = 'auth.login_failed' ORDER BY ts DESC LIMIT 1").first();
    expect(row).not.toBeNull();
  });

  it("vincular otro dispositivo: requiere sesion, agrega la passkey a la MISMA cuenta y el codigo es de un solo uso", async () => {
    const { cookie, userId } = await sessionCookie("admin");
    try {
      expect((await api("/auth/passkey/link/code", { method: "POST", json: {}, headers: ip() })).status).toBe(401);

      const gen = await api("/auth/passkey/link/code", { method: "POST", json: {}, cookie, headers: ip() });
      expect(gen.status).toBe(200);
      const { code, expires_at } = (await gen.json()) as { code: string; expires_at: number };
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
      expect(expires_at - Date.now()).toBeLessThanOrEqual(10 * 60_000);
      // Solo se guarda el hash.
      expect(await env.DB.prepare("SELECT 1 AS x FROM link_codes WHERE code_hash = ?").bind(code).first()).toBeNull();

      const usersBefore = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())!.n;
      const h = ip();
      const typed = `${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`; // tolera minusculas y guion
      const o = (await (await api("/auth/passkey/link/options", { method: "POST", headers: h, json: { code: typed } })).json()) as Opts;
      expect(o.challenge_id).toMatch(/^chl_/);
      const { response, credential } = await softRegister(o.options, ORIGIN);
      const v = await api("/auth/passkey/register/verify", { method: "POST", headers: h, json: { challenge_id: o.challenge_id, response } });
      expect(v.status).toBe(200);
      expect(await v.json()).toEqual({ authenticated: true, role: "admin", name: "Prueba admin" });
      expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())!.n).toBe(usersBefore);
      const owner = await env.DB.prepare("SELECT user_id FROM passkeys WHERE user_id = ?").bind(userId).first<{ user_id: string }>();
      expect(owner!.user_id).toBe(userId);

      // Reutilizar el codigo -> 403.
      expect((await api("/auth/passkey/link/options", { method: "POST", headers: ip(), json: { code } })).status).toBe(403);
      // La passkey vinculada inicia sesion en la misma cuenta.
      const li = await login(credential);
      expect(li.status).toBe(200);

      // Un segundo codigo excluye la credencial ya registrada (no duplica en el mismo dispositivo).
      const gen2 = (await (await api("/auth/passkey/link/code", { method: "POST", json: {}, cookie, headers: ip() })).json()) as { code: string };
      const o2 = (await (await api("/auth/passkey/link/options", { method: "POST", headers: ip(), json: { code: gen2.code } })).json()) as Opts;
      expect(o2.options.excludeCredentials?.length).toBe(1);
    } finally {
      await cleanup(userId);
    }
  });

  it("codigo de vinculacion inexistente o caducado -> 403", async () => {
    const { cookie, userId } = await sessionCookie("operator");
    try {
      expect((await api("/auth/passkey/link/options", { method: "POST", headers: ip(), json: { code: "ABCDEFGHJK" } })).status).toBe(403);
      const { code } = (await (await api("/auth/passkey/link/code", { method: "POST", json: {}, cookie, headers: ip() })).json()) as { code: string };
      await env.DB.prepare("UPDATE link_codes SET expires_at = ? WHERE user_id = ?").bind(Date.now() - 1, userId).run();
      expect((await api("/auth/passkey/link/options", { method: "POST", headers: ip(), json: { code } })).status).toBe(403);
    } finally {
      await cleanup(userId);
    }
  });

  it("un visitante solo lee: escrituras y generacion de codigos sin sesion -> 401", async () => {
    expect((await api("/campus")).status).toBe(200);
    expect((await api("/scenarios/normalizar", { method: "POST", headers: ip() })).status).toBe(401);
    expect((await api("/rules/RULE_CO2_HIGH", { method: "PATCH", json: { enabled: false }, headers: ip() })).status).toBe(401);
    expect((await api("/auth/passkey/link/code", { method: "POST", json: {}, headers: ip() })).status).toBe(401);
  });
});
