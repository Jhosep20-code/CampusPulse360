import { MetricValues } from "@campuspulse/contracts";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chunk, loadConfig, MAX_READINGS_PER_BATCH, postBatch, runBackfill, type FetchLike } from "../src/cli.ts";
import { DEVICES, limaHour, limaWeekday, Simulator } from "../src/model.ts";
import { signBody, signedHeaders } from "../src/sign.ts";

const KEY_HEX = "746573742d6b65792d6e6f742d736563726574"; // bytes de "test-key-not-secret"

describe("firma HMAC", () => {
  it("coincide con un vector calculado de forma independiente con node:crypto", async () => {
    const body = '{"gateway_id":"gw-test","source":"sim","readings":[]}';
    const ts = 1_900_000_000_000;
    const expected = createHmac("sha256", Buffer.from(KEY_HEX, "hex")).update(`${ts}.${body}`).digest("hex");
    expect(await signBody(KEY_HEX, ts, body)).toBe(expected);
    const h = await signedHeaders("gw-test", KEY_HEX, ts, body);
    expect(h).toMatchObject({ "x-gateway-id": "gw-test", "x-timestamp": String(ts), "x-signature": expected });
  });

  it("rechaza claves que no son hexadecimales", async () => {
    await expect(signBody("no-es-hex", 1, "x")).rejects.toThrow("hexadecimal");
  });
});

describe("modelo", () => {
  const DAY = Date.UTC(2026, 2, 10, 0, 0, 0); // martes 10-mar-2026 00:00 UTC

  it("hora y dia de Lima (UTC-5)", () => {
    expect(limaHour(Date.UTC(2026, 2, 10, 15, 30))).toBeCloseTo(10.5, 6);
    expect(limaWeekday(Date.UTC(2026, 2, 10, 3, 0))).toBe(1); // lunes 22:00 en Lima
  });

  it("todos los valores quedan dentro de los rangos de MetricValues durante 3 dias", () => {
    const sim = new Simulator({ seed: 7, failureRate: 0.02 });
    let n = 0;
    for (let m = 0; m < 3 * 24 * 60; m += 5) {
      for (const r of sim.step(DAY + m * 60_000)) {
        const { device_id: _d, ts: _t, ...vals } = r;
        expect(MetricValues.safeParse(vals).success, JSON.stringify(r)).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(3000);
  });

  it("es determinista con la misma semilla y respeta el horario (aula llena de dia, vacia de noche)", () => {
    const a = new Simulator({ seed: 3 });
    const b = new Simulator({ seed: 3 });
    const noon = DAY + 17 * 3_600_000; // 12:00 Lima
    expect(a.step(noon)).toEqual(b.step(noon));
    const sim = new Simulator({ seed: 3 });
    for (let m = 0; m < 24 * 60; m += 5) sim.step(DAY + m * 60_000);
    const day = sim.step(DAY + 24 * 3_600_000 + 17 * 3_600_000).find((r) => r.device_id === "DEV_2_A201");
    const night = new Simulator({ seed: 3 }).step(DAY + 24 * 3_600_000 + 6 * 3_600_000).find((r) => r.device_id === "DEV_2_A201"); // 01:00 Lima
    expect(day?.occupancy).toBeGreaterThan(5);
    expect(night?.occupancy).toBe(0);
    expect(night?.co2_ppm).toBeLessThan(500);
  });

  it("modo escenario: el aula supera su aforo y el CO2 sube con el tiempo", () => {
    const sim = new Simulator({ seed: 1, scenarioDevices: ["DEV_3_A301"] });
    const t0 = DAY + 17 * 3_600_000;
    let last = sim.stepDevice("DEV_3_A301", t0);
    for (let s = 10; s <= 3600; s += 10) last = sim.stepDevice("DEV_3_A301", t0 + s * 1000);
    expect(last?.occupancy).toBeGreaterThan(45);
    expect(last?.co2_ppm).toBeGreaterThan(1500);
  });

  it("la lista de dispositivos coincide con la semilla (10 dispositivos DEV_<piso>_<codigo>)", () => {
    expect(DEVICES).toHaveLength(10);
    expect(DEVICES.every((d) => /^DEV_\d_[A-Z0-9]+$/.test(d.id))).toBe(true);
  });
});

describe("cli", () => {
  it("la configuracion es obligatoria y no tiene valores por defecto", () => {
    expect(() => loadConfig({})).toThrow("API_URL, GATEWAY_ID, GATEWAY_KEY");
    expect(loadConfig({ API_URL: "http://x/", GATEWAY_ID: "g", GATEWAY_KEY: "ab" })).toEqual({ apiUrl: "http://x", gatewayId: "g", gatewayKey: "ab" });
  });

  it("backfill de 10 min envia un lote firmado con 110 lecturas (por minuto)", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const fake: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      const n = (JSON.parse(init.body) as { readings: unknown[] }).readings.length;
      return { ok: true, status: 200, json: async () => ({ accepted: n, rejected: [] }) };
    };
    const cfg = { apiUrl: "http://localhost:8787", gatewayId: "gw-test", gatewayKey: KEY_HEX };
    const r = await runBackfill(cfg, 10, new Simulator({ seed: 1 }), 1_900_000_000_000, fake);
    expect(r).toEqual({ sent: 110, accepted: 110, rejected: 0, batches: 1 });
    const c = calls[0];
    expect(c?.url).toBe("http://localhost:8787/api/v1/ingest");
    const expected = createHmac("sha256", Buffer.from(KEY_HEX, "hex")).update(`${c?.headers["x-timestamp"]}.${c?.body}`).digest("hex");
    expect(c?.headers["x-signature"]).toBe(expected);
    const batch = JSON.parse(c?.body ?? "{}");
    expect(batch).toMatchObject({ gateway_id: "gw-test", source: "sim" });
    expect(batch.readings.every((x: { ts: number }) => x.ts <= 1_900_000_000_000)).toBe(true);
  });

  it("divide en lotes de maximo 120 lecturas y propaga errores HTTP", async () => {
    expect(MAX_READINGS_PER_BATCH).toBe(120);
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 120).map((c) => c.length)).toEqual([120, 120, 10]);
    const bad: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(postBatch({ apiUrl: "http://x", gatewayId: "g", gatewayKey: KEY_HEX }, [], bad)).rejects.toThrow("HTTP 401");
  });
});
