import { Hono } from "hono";
import { INGEST_MAX_SKEW_MS, IngestBatch, type IngestResult } from "@campuspulse/contracts";
import { clientIp, DAY_MS, type AppEnv } from "../lib/db";
import { hexToBytes, verifyHmacSha256 } from "../lib/hmac";
import { HttpError } from "../lib/problem";
import { enforceRateLimit } from "../lib/rate-limit";
import { readBodyLimited } from "../lib/validate";

const MAX_BODY = 64 * 1024;
const FUTURE_TOLERANCE_MS = 60_000;
const enc = new TextEncoder();

function gatewayKey(secret: string | undefined, gatewayId: string): Uint8Array<ArrayBuffer> | null {
  if (!secret) return null;
  try {
    const keys = JSON.parse(secret) as Record<string, unknown>;
    if (!Object.hasOwn(keys, gatewayId)) return null;
    const hex = keys[gatewayId];
    return typeof hex === "string" ? hexToBytes(hex) : null;
  } catch {
    return null;
  }
}

export const ingestRoutes = new Hono<AppEnv>();

/**
 * POST /ingest: sin sesion; autenticado por HMAC-SHA256 de `${timestamp}.${cuerpo_crudo}`.
 * Todos los fallos de autenticacion devuelven el mismo 401 (no revela si el gateway existe).
 */
ingestRoutes.post("/ingest", async (c) => {
  const now = Date.now();
  // Guardia barata por IP antes de gastar CPU en criptografia.
  await enforceRateLimit(c.env, `ingest-ip:${clientIp(c)}`, 300, now);

  const body = await readBodyLimited(c.req.raw, MAX_BODY);

  const gw = c.req.header("x-gateway-id") ?? "";
  const tsHeader = c.req.header("x-timestamp") ?? "";
  const sigHeader = c.req.header("x-signature") ?? "";
  const unauthorized = () => new HttpError(401, "Autenticacion de gateway invalida");

  if (!gw || gw.length > 64 || !/^\d{1,15}$/.test(tsHeader)) throw unauthorized();
  const key = gatewayKey(c.env.GATEWAY_KEYS, gw);
  const sig = hexToBytes(sigHeader);
  if (!key || !sig) throw unauthorized();
  const ts = Number(tsHeader);
  if (Math.abs(now - ts) > INGEST_MAX_SKEW_MS) throw unauthorized();

  const prefix = enc.encode(`${tsHeader}.`);
  const data = new Uint8Array(prefix.length + body.length);
  data.set(prefix, 0);
  data.set(body, prefix.length);
  if (!(await verifyHmacSha256(key, sig, data))) throw unauthorized();

  // Gateway autenticado: limite por gateway.
  await enforceRateLimit(c.env, `ingest:${gw}`, 60, now);

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
  } catch {
    throw new HttpError(400, "JSON invalido");
  }
  const batch = IngestBatch.parse(json);
  if (batch.gateway_id !== gw) throw new HttpError(403, "gateway_id del cuerpo no coincide con X-Gateway-Id");
  if (batch.source === "device") {
    throw new HttpError(400, "source=device esta reservado; toda la telemetria actual es simulada");
  }

  // Solo dispositivos de este gateway: los ajenos o inexistentes se rechazan igual.
  const devs = await c.env.DB.prepare(
    `SELECT d.id, d.active, EXISTS (SELECT 1 FROM scenario_overrides o WHERE o.device_id = d.id AND o.until > ?2) AS overridden
       FROM devices d WHERE d.gateway_id = ?1`,
  )
    .bind(gw, now)
    .all<{ id: string; active: number; overridden: number }>();
  const known = new Map(devs.results.map((d) => [d.id, d.active === 1]));
  const overridden = new Set(devs.results.filter((d) => d.overridden === 1).map((d) => d.id));

  const rejected: IngestResult["rejected"] = [];
  const insertStmts: D1PreparedStatement[] = [];
  const insertIdx: string[] = [];
  const lastSeen = new Map<string, number>();
  const ins = c.env.DB.prepare(
    `INSERT OR IGNORE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of batch.readings) {
    const active = known.get(r.device_id);
    if (active === undefined) {
      rejected.push({ device_id: r.device_id, reason: "dispositivo desconocido o de otro gateway" });
    } else if (!active) {
      rejected.push({ device_id: r.device_id, reason: "dispositivo inactivo" });
    } else if (overridden.has(r.device_id)) {
      rejected.push({ device_id: r.device_id, reason: "escenario de demostracion activo" });
    } else if (r.ts > now + FUTURE_TOLERANCE_MS) {
      rejected.push({ device_id: r.device_id, reason: "ts en el futuro" });
    } else if (r.ts < now - DAY_MS) {
      rejected.push({ device_id: r.device_id, reason: "ts anterior a 24 h" });
    } else {
      insertStmts.push(
        ins.bind(r.device_id, r.ts, r.co2_ppm, r.temp_c, r.rh_pct, r.occupancy, r.power_w, batch.source),
      );
      insertIdx.push(r.device_id);
      lastSeen.set(r.device_id, Math.max(lastSeen.get(r.device_id) ?? 0, r.ts));
    }
  }

  let accepted = 0;
  if (insertStmts.length > 0) {
    const seen = c.env.DB.prepare("UPDATE devices SET last_seen = MAX(COALESCE(last_seen, 0), ?) WHERE id = ?");
    const stmts = [...insertStmts];
    for (const [id, t] of lastSeen) stmts.push(seen.bind(t, id));
    const results = await c.env.DB.batch(stmts);
    insertIdx.forEach((deviceId, i) => {
      if ((results[i]?.meta.changes ?? 0) > 0) accepted++;
      else rejected.push({ device_id: deviceId, reason: "lectura duplicada (device_id, ts)" });
    });
  }

  const result: IngestResult = { accepted, rejected };
  return c.json(result);
});
