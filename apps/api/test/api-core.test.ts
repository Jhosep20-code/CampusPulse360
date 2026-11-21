import { beforeAll, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import {
  BASE,
  DEV_OTHER_GW,
  DEV_TEST,
  GW,
  SPACE_TEST,
  api,
  assignTestGateway,
  reading,
  signedIngest,
} from "./helpers";

beforeAll(async () => {
  await assignTestGateway();
});

describe("sistema y lecturas publicas", () => {
  it("GET /system/health responde 200 con db ok y ai en fallback (mock)", async () => {
    const res = await api("/system/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { db: boolean; ai: string } };
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe(true);
    expect(body.checks.ai).toBe("fallback");
  });

  it("GET /campus devuelve 10 espacios y geometry_provisional booleano", async () => {
    const res = await api("/campus");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      building: { geometry_provisional: unknown };
      floors: unknown[];
      spaces: { id: string; level: number }[];
    };
    expect(body.spaces).toHaveLength(10);
    expect(body.floors).toHaveLength(5);
    expect(typeof body.building.geometry_provisional).toBe("boolean");
  });

  it("incluye cabeceras de seguridad y 404 problem+json para rutas desconocidas", async () => {
    const res = await api("/campus");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const nf = await api("/no-existe");
    expect(nf.status).toBe(404);
    expect(nf.headers.get("content-type")).toContain("application/problem+json");
    expect(nf.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /spaces/:id devuelve el espacio y 404 si no existe", async () => {
    const ok = await api(`/spaces/${SPACE_TEST}`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { space: { id: string }; live: { space_id: string } };
    expect(body.space.id).toBe(SPACE_TEST);
    expect(body.live.space_id).toBe(SPACE_TEST);
    expect((await api("/spaces/NOPE")).status).toBe(404);
  });

  it("rechaza rangos de lecturas superiores a 7 dias", async () => {
    const to = Date.now();
    const res = await api(`/spaces/${SPACE_TEST}/readings?from=${to - 8 * 86_400_000}&to=${to}`);
    expect(res.status).toBe(400);
  });
});

describe("ingesta firmada con HMAC", () => {
  it("acepta una lectura con firma valida y /live la refleja con su status", async () => {
    const ts = Date.now();
    const res = await signedIngest({
      gateway_id: GW,
      source: "sim",
      readings: [reading(DEV_TEST, { ts, co2_ppm: 1600, occupancy: 12 })],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; rejected: unknown[] };
    expect(body.accepted).toBe(1);
    expect(body.rejected).toHaveLength(0);

    const live = await api("/live");
    expect(live.status).toBe(200);
    const snap = (await live.json()) as {
      simulated: boolean;
      kpis: { spaces_total: number };
      spaces: { space_id: string; status: string; last_ts: number; source: string; metrics: { co2_ppm: number } }[];
    };
    expect(snap.simulated).toBe(true);
    expect(snap.kpis.spaces_total).toBe(10);
    const sp = snap.spaces.find((s) => s.space_id === SPACE_TEST);
    expect(sp?.metrics.co2_ppm).toBe(1600);
    expect(sp?.status).toBe("critical");
    expect(sp?.source).toBe("sim");
    expect(sp?.last_ts).toBe(ts);
  });

  it("marca como duplicada una lectura repetida (device_id, ts)", async () => {
    const r = reading(DEV_TEST, { ts: Date.now() - 5000 });
    const batch = { gateway_id: GW, source: "sim", readings: [r] };
    expect(((await (await signedIngest(batch)).json()) as { accepted: number }).accepted).toBe(1);
    const second = (await (await signedIngest(batch)).json()) as { accepted: number; rejected: { reason: string }[] };
    expect(second.accepted).toBe(0);
    expect(second.rejected[0]?.reason).toContain("duplicada");
  });

  it("firma invalida -> 401", async () => {
    const batch = { gateway_id: GW, source: "sim", readings: [reading(DEV_TEST)] };
    const res = await signedIngest(batch, { signOther: "otro-cuerpo" });
    expect(res.status).toBe(401);
    const bad = await signedIngest(batch, { keyHex: "00".repeat(20) });
    expect(bad.status).toBe(401);
  });

  it("gateway desconocido o sin cabeceras -> 401", async () => {
    const batch = { gateway_id: "gw-fantasma", source: "sim", readings: [reading(DEV_TEST)] };
    expect((await signedIngest(batch, { gw: "gw-fantasma" })).status).toBe(401);
    const bare = await SELF.fetch(`${BASE}/ingest`, { method: "POST", body: "{}" });
    expect(bare.status).toBe(401);
  });

  it("desfase de reloj mayor a 60 s -> 401 (anti-replay)", async () => {
    const batch = { gateway_id: GW, source: "sim", readings: [reading(DEV_TEST)] };
    const old = await signedIngest(batch, { ts: Date.now() - 120_000 });
    expect(old.status).toBe(401);
    const future = await signedIngest(batch, { ts: Date.now() + 120_000 });
    expect(future.status).toBe(401);
  });

  it("dispositivo de otro gateway, futuro y antiguo -> rejected con motivo", async () => {
    const now = Date.now();
    const res = await signedIngest({
      gateway_id: GW,
      source: "sim",
      readings: [
        reading(DEV_OTHER_GW, { ts: now - 1000 }),
        reading("DEV_NO_EXISTE", { ts: now - 1000 }),
        reading(DEV_TEST, { ts: now + 3_600_000 }),
        reading(DEV_TEST, { ts: now - 2 * 86_400_000 }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; rejected: { device_id: string; reason: string }[] };
    expect(body.accepted).toBe(0);
    expect(body.rejected).toHaveLength(4);
    expect(body.rejected.find((r) => r.device_id === DEV_OTHER_GW)?.reason).toContain("otro gateway");
    expect(body.rejected.some((r) => r.reason.includes("futuro"))).toBe(true);
    expect(body.rejected.some((r) => r.reason.includes("24 h"))).toBe(true);
  });

  it("lote fuera de esquema -> 400 y gateway_id distinto -> 403", async () => {
    const empty = await signedIngest({ gateway_id: GW, source: "sim", readings: [] });
    expect(empty.status).toBe(400);
    const body = (await empty.json()) as { errors?: { path: string }[] };
    expect(body.errors?.length).toBeGreaterThan(0);

    const invalid = await signedIngest({ gateway_id: GW, readings: [{ device_id: DEV_TEST, ts: Date.now(), co2_ppm: -5 }] });
    expect(invalid.status).toBe(400);

    const mismatch = await signedIngest({ gateway_id: "gw-sim-01", source: "sim", readings: [reading(DEV_TEST)] });
    expect(mismatch.status).toBe(403);
  });

  it("cuerpo mayor a 64 KB -> 413", async () => {
    const res = await signedIngest("x".repeat(70_000));
    expect(res.status).toBe(413);
  });
});

describe("/live con ETag", () => {
  it("la segunda peticion con If-None-Match devuelve 304", async () => {
    let status = 0;
    // El ETag incluye el minuto actual: si cambia entre llamadas se reintenta una vez.
    for (let i = 0; i < 2 && status !== 304; i++) {
      const first = await api("/live");
      expect(first.status).toBe(200);
      expect(first.headers.get("cache-control")).toBe("no-cache");
      const etag = first.headers.get("etag");
      expect(etag).toMatch(/^W\//);
      await first.arrayBuffer();
      const second = await api("/live", { headers: { "if-none-match": etag! } });
      status = second.status;
      await second.arrayBuffer();
    }
    expect(status).toBe(304);
  });
});

describe("series de lecturas", () => {
  it("agrega por bucket con AVG", async () => {
    const res = await api(`/spaces/${SPACE_TEST}/readings?step=60`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { step: number; points: { ts: number; co2_ppm: number }[] };
    expect(body.step).toBe(60);
    expect(body.points.length).toBeGreaterThan(0);
    for (const p of body.points) expect(p.ts % 60_000).toBe(0);
  });
});
