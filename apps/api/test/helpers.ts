import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { bytesToHex, randomToken, sha256Hex } from "../src/lib/hmac";

export const BASE = "http://localhost/api/v1";
export const GW = "gw-test";
export const GW_KEY_HEX = "746573742d6b65792d6e6f742d736563726574";
/** Dispositivo sembrado que las pruebas reasignan a gw-test. */
export const DEV_TEST = "DEV_2_A201";
export const SPACE_TEST = "SPC_2_A201";
/** Dispositivo que se queda en gw-sim-01 (de otro gateway). */
export const DEV_OTHER_GW = "DEV_2_A202";

const enc = new TextEncoder();

export async function hmacHex(keyHex: string, data: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export interface SignedOpts {
  gw?: string;
  ts?: number;
  keyHex?: string;
  /** Firma otro texto distinto del enviado (para probar firmas invalidas). */
  signOther?: string;
}

/** POST /ingest firmado con HMAC. `body` puede ser objeto o texto crudo. */
export async function signedIngest(body: unknown, opts: SignedOpts = {}): Promise<Response> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = opts.ts ?? Date.now();
  const gw = opts.gw ?? GW;
  const sig = await hmacHex(opts.keyHex ?? GW_KEY_HEX, `${ts}.${opts.signOther ?? raw}`);
  return SELF.fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gateway-id": gw,
      "x-timestamp": String(ts),
      "x-signature": sig,
    },
    body: raw,
  });
}

export function reading(deviceId: string, over: Record<string, number> = {}) {
  return {
    device_id: deviceId,
    ts: Date.now(),
    co2_ppm: 650,
    temp_c: 22.5,
    rh_pct: 50,
    occupancy: 10,
    power_w: 1200,
    ...over,
  };
}

/** Deja DEV_2_A201 asignado a gw-test (los dispositivos sembrados son de gw-sim-01). */
export async function assignTestGateway(): Promise<void> {
  await env.DB.prepare("UPDATE devices SET gateway_id = ? WHERE id = ?").bind(GW, DEV_TEST).run();
}

/** Crea usuario + sesion directamente en D1 y devuelve la cabecera Cookie. */
export async function sessionCookie(role: "admin" | "operator"): Promise<{ cookie: string; userId: string }> {
  const userId = `usr_test_${role}_${randomToken(6)}`;
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)").bind(userId, `Prueba ${role}`, role, now),
    env.DB.prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(
      await sha256Hex(token),
      userId,
      now + 3_600_000,
      now,
    ),
  ]);
  return { cookie: `cp_session=${token}`, userId };
}

export function api(path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}): Promise<Response> {
  const { cookie, json, headers, ...rest } = init;
  const h = new Headers(headers);
  if (cookie) h.set("cookie", cookie);
  const method = (rest.method ?? "GET").toUpperCase();
  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
  }
  if (method !== "GET" && method !== "HEAD" && !h.has("content-type")) h.set("content-type", "application/json");
  return SELF.fetch(`${BASE}${path}`, { ...rest, headers: h, ...(body !== undefined ? { body } : {}) });
}
