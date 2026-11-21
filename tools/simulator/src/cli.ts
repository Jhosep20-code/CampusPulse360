/**
 * Simulador IoT de CampusPulse 360 (telemetria SIMULADA).
 *
 *   API_URL=https://... GATEWAY_ID=gw-sim-01 GATEWAY_KEY=<hex> node src/cli.ts live [--interval 60]
 *        [--scenario-device DEV_3_A301 --scenario-interval 10] [--failure-rate 0.01] [--seed 1]
 *   API_URL=... GATEWAY_ID=... GATEWAY_KEY=... node src/cli.ts backfill [--minutes 10]
 *
 * API_URL, GATEWAY_ID y GATEWAY_KEY son obligatorias y no tienen valores por defecto.
 */
import type { IngestBatch, IngestReading, IngestResult } from "@campuspulse/contracts";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Simulator } from "./model.ts";
import { signedHeaders } from "./sign.ts";

export const MAX_READINGS_PER_BATCH = 120;

export interface Config {
  apiUrl: string;
  gatewayId: string;
  gatewayKey: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing = ["API_URL", "GATEWAY_ID", "GATEWAY_KEY"].filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(", ")}`);
  return { apiUrl: (env.API_URL as string).replace(/\/+$/, ""), gatewayId: env.GATEWAY_ID as string, gatewayKey: env.GATEWAY_KEY as string };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Envia un lote firmado. Devuelve el resultado de ingesta o lanza con el codigo HTTP. */
export async function postBatch(
  cfg: Config,
  readings: IngestReading[],
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  now: number = Date.now(),
): Promise<IngestResult> {
  const batch: IngestBatch = { gateway_id: cfg.gatewayId, source: "sim", readings };
  const body = JSON.stringify(batch);
  const headers = await signedHeaders(cfg.gatewayId, cfg.gatewayKey, now, body);
  const res = await fetchFn(`${cfg.apiUrl}/api/v1/ingest`, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`ingesta rechazada: HTTP ${res.status}`);
  return (await res.json()) as IngestResult;
}

/** Un lote firmado (o varios si superan el maximo del contrato) con lecturas por minuto hasta ahora. */
export async function runBackfill(
  cfg: Config,
  minutes: number,
  sim: Simulator,
  now: number,
  fetchFn?: FetchLike,
): Promise<{ sent: number; accepted: number; rejected: number; batches: number }> {
  const readings: IngestReading[] = [];
  for (let m = minutes; m >= 0; m--) readings.push(...sim.step(now - m * 60_000));
  let accepted = 0;
  let rejected = 0;
  const parts = chunk(readings, MAX_READINGS_PER_BATCH);
  for (const part of parts) {
    const r = await postBatch(cfg, part, fetchFn, Date.now());
    accepted += r.accepted;
    rejected += r.rejected.length;
    console.log(`lote de ${part.length} lecturas: aceptadas=${r.accepted} rechazadas=${r.rejected.length}`);
  }
  return { sent: readings.length, accepted, rejected, batches: parts.length };
}

function num(v: string | undefined, def: number, name: string): number {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} debe ser un numero positivo`);
  return n;
}

async function tick(cfg: Config, sim: Simulator, deviceId?: string): Promise<void> {
  const ts = Date.now();
  const readings = deviceId ? [sim.stepDevice(deviceId, ts)].filter((r): r is IngestReading => r !== null) : sim.step(ts);
  if (readings.length === 0) {
    console.log(`[${new Date(ts).toISOString()}] sin lecturas (dispositivos caidos)`);
    return;
  }
  try {
    const r = await postBatch(cfg, readings, undefined, ts);
    console.log(
      `[${new Date(ts).toISOString()}] ${deviceId ?? "todos"}: enviadas=${readings.length} aceptadas=${r.accepted} rechazadas=${r.rejected.length}`,
    );
  } catch (e) {
    console.error(`[${new Date(ts).toISOString()}] error: ${e instanceof Error ? e.message : "desconocido"}`);
  }
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      interval: { type: "string" },
      minutes: { type: "string" },
      seed: { type: "string" },
      "failure-rate": { type: "string" },
      "scenario-device": { type: "string" },
      "scenario-interval": { type: "string" },
    },
  });
  const mode = positionals[0] ?? "live";
  const cfg = loadConfig(env);
  const scenarioDevice = values["scenario-device"];
  const sim = new Simulator({
    seed: num(values.seed, 1, "seed"),
    failureRate: values["failure-rate"] ? Number(values["failure-rate"]) : 0,
    scenarioDevices: scenarioDevice ? [scenarioDevice] : [],
  });

  if (mode === "backfill") {
    const minutes = num(values.minutes, 10, "minutes");
    const r = await runBackfill(cfg, minutes, sim, Date.now());
    console.log(`backfill: ${JSON.stringify(r)}`);
    return;
  }
  if (mode !== "live") throw new Error(`modo desconocido: ${mode} (usa live o backfill)`);

  const intervalS = num(values.interval, 60, "interval");
  console.log(`simulador live: gateway=${cfg.gatewayId} intervalo=${intervalS}s${scenarioDevice ? ` escenario=${scenarioDevice}` : ""}`);
  const timers: Array<ReturnType<typeof setInterval>> = [];
  await tick(cfg, sim);
  timers.push(setInterval(() => void tick(cfg, sim), intervalS * 1000));
  if (scenarioDevice) {
    const sInt = num(values["scenario-interval"], 10, "scenario-interval");
    timers.push(setInterval(() => void tick(cfg, sim, scenarioDevice), sInt * 1000));
  }
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  for (const t of timers) clearInterval(t);
  console.log("simulador detenido");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
