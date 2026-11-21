import { Hono } from "hono";
import {
  Metric,
  ReadingsQuery,
  statusFromMetrics,
  type CampusResponse,
  type DataSource,
  type LiveSnapshot,
  type LiveSpace,
  type MetricValues,
  type ReadingsResponse,
  type SpaceStatus,
} from "@campuspulse/contracts";
import { z } from "zod";
import type { Env } from "../env";
import { DAY_MS, OPEN_STATUSES_SQL, type AppEnv } from "../lib/db";
import { HttpError } from "../lib/problem";
import { parseQuery } from "../lib/validate";
import { forecastForSpace } from "../forecast/service";

export const publicRoutes = new Hono<AppEnv>();

interface SpaceRow {
  id: string;
  floor_id: string;
  level: number;
  code: string;
  name: string;
  type: CampusResponse["spaces"][number]["type"];
  capacity: number;
  mesh_id: string;
}

const SPACE_SQL = `SELECT s.id, s.floor_id, f.level, s.code, s.name, s.type, s.capacity, s.mesh_id
  FROM spaces s JOIN floors f ON f.id = s.floor_id`;

/* ---------------------------------------------------------------- campus */

publicRoutes.get("/campus", async (c) => {
  const b = await c.env.DB.prepare("SELECT id, name, geometry_provisional FROM buildings ORDER BY id LIMIT 1").first<{
    id: string;
    name: string;
    geometry_provisional: number;
  }>();
  if (!b) throw new HttpError(404, "Campus no configurado");
  const floors = await c.env.DB.prepare("SELECT id, building_id, level, name FROM floors WHERE building_id = ? ORDER BY level")
    .bind(b.id)
    .all<CampusResponse["floors"][number]>();
  const spaces = await c.env.DB.prepare(`${SPACE_SQL} ORDER BY f.level, s.code`).all<SpaceRow>();
  const body: CampusResponse = {
    building: { id: b.id, name: b.name, geometry_provisional: b.geometry_provisional === 1 },
    floors: floors.results,
    spaces: spaces.results as CampusResponse["spaces"],
  };
  return c.json(body);
});

/* ---------------------------------------------------------------- live */

interface LiveBuild {
  spaces: LiveSpace[];
  capacity: Map<string, number>;
  maxTs: number;
}

/** Ultima lectura de las ultimas 24 h por dispositivo; por espacio se usa la mas reciente. */
async function buildLive(env: Env, now: number, spaceId?: string): Promise<LiveBuild> {
  const where = spaceId ? "WHERE id = ?" : "";
  const sp = env.DB.prepare(`SELECT id, mesh_id, capacity FROM spaces ${where} ORDER BY mesh_id`);
  const spaces = await (spaceId ? sp.bind(spaceId) : sp).all<{ id: string; mesh_id: string; capacity: number }>();

  const rows = await env.DB.prepare(
    `SELECT d.space_id, r.ts, r.co2_ppm, r.temp_c, r.rh_pct, r.occupancy, r.power_w, r.source
     FROM devices d
     JOIN readings r ON r.device_id = d.id
      AND r.ts = (SELECT MAX(ts) FROM readings WHERE device_id = d.id AND ts >= ?)
     WHERE d.active = 1`,
  )
    .bind(now - DAY_MS)
    .all<MetricValues & { space_id: string; ts: number; source: DataSource }>();

  const latest = new Map<string, (typeof rows.results)[number]>();
  for (const r of rows.results) {
    const cur = latest.get(r.space_id);
    if (!cur || r.ts > cur.ts) latest.set(r.space_id, r);
  }

  const capacity = new Map<string, number>();
  let maxTs = 0;
  const out: LiveSpace[] = spaces.results.map((s) => {
    capacity.set(s.id, s.capacity);
    const r = latest.get(s.id);
    const metrics: MetricValues | null = r
      ? { co2_ppm: r.co2_ppm, temp_c: r.temp_c, rh_pct: r.rh_pct, occupancy: r.occupancy, power_w: r.power_w }
      : null;
    if (r && r.ts > maxTs) maxTs = r.ts;
    const status: SpaceStatus = statusFromMetrics(metrics, s.capacity, r?.ts ?? null, now);
    return {
      space_id: s.id,
      mesh_id: s.mesh_id,
      status,
      last_ts: r?.ts ?? null,
      source: r?.source ?? null,
      metrics,
    };
  });
  return { spaces: out, capacity, maxTs };
}

async function openIncidents(env: Env): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM incidents WHERE status IN ${OPEN_STATUSES_SQL}`).first<{ n: number }>();
  return r?.n ?? 0;
}

function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const norm = (s: string) => s.trim().replace(/^W\//, "");
  const target = norm(etag);
  return header.split(",").some((t) => t.trim() === "*" || norm(t) === target);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

publicRoutes.get("/live", async (c) => {
  const now = Date.now();
  const [live, open, capRow] = await Promise.all([
    buildLive(c.env, now),
    openIncidents(c.env),
    c.env.DB.prepare("SELECT COALESCE(SUM(capacity), 0) AS n FROM spaces").first<{ n: number }>(),
  ]);
  const etag = `W/"${live.maxTs}-${open}-${Math.floor(now / 60_000)}"`;
  const headers = { ETag: etag, "Cache-Control": "no-cache" };
  if (ifNoneMatchHits(c.req.header("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  const count = (s: SpaceStatus) => live.spaces.filter((x) => x.status === s).length;
  // Los promedios y totales usan solo espacios con dato vigente (no offline).
  const fresh = live.spaces.filter((x) => x.status !== "offline" && x.metrics);
  const avg = (f: (m: MetricValues) => number) =>
    fresh.length ? round1(fresh.reduce((a, x) => a + f(x.metrics as MetricValues), 0) / fresh.length) : null;
  const body: LiveSnapshot = {
    generated_at: now,
    simulated: true,
    kpis: {
      spaces_total: live.spaces.length,
      spaces_ok: count("ok"),
      spaces_warning: count("warning"),
      spaces_critical: count("critical"),
      spaces_offline: count("offline"),
      occupancy_total: fresh.reduce((a, x) => a + (x.metrics?.occupancy ?? 0), 0),
      capacity_total: capRow?.n ?? 0,
      avg_co2_ppm: avg((m) => m.co2_ppm),
      avg_temp_c: avg((m) => m.temp_c),
      power_total_w: fresh.length ? Math.round(fresh.reduce((a, x) => a + (x.metrics?.power_w ?? 0), 0)) : null,
      open_incidents: open,
    },
    spaces: live.spaces,
  };
  return c.json(body, 200, headers);
});

/* ---------------------------------------------------------------- espacios */

async function requireSpace(env: Env, id: string): Promise<SpaceRow> {
  const row = await env.DB.prepare(`${SPACE_SQL} WHERE s.id = ?`).bind(id).first<SpaceRow>();
  if (!row) throw new HttpError(404, "Espacio no encontrado");
  return row;
}

publicRoutes.get("/spaces/:id", async (c) => {
  const space = await requireSpace(c.env, c.req.param("id"));
  const live = await buildLive(c.env, Date.now(), space.id);
  const ls = live.spaces[0];
  if (!ls) throw new HttpError(404, "Espacio no encontrado");
  return c.json({ space, live: ls });
});

const RANGE_MAX_MS = 7 * DAY_MS;

publicRoutes.get("/spaces/:id/readings", async (c) => {
  const space = await requireSpace(c.env, c.req.param("id"));
  const q = parseQuery(c, ReadingsQuery);
  const now = Date.now();
  const to = q.to ?? now;
  const from = q.from ?? to - 6 * 3_600_000;
  if (from >= to) throw new HttpError(400, "from debe ser anterior a to");
  if (to - from > RANGE_MAX_MS) throw new HttpError(400, "El rango maximo es de 7 dias");
  // step esta validado por zod como entero 60..3600: se interpola de forma segura.
  const stepMs = q.step * 1000;
  const rows = await c.env.DB.prepare(
    `SELECT (r.ts / ${stepMs}) * ${stepMs} AS ts,
            AVG(r.co2_ppm) AS co2_ppm, AVG(r.temp_c) AS temp_c, AVG(r.rh_pct) AS rh_pct,
            AVG(r.occupancy) AS occupancy, AVG(r.power_w) AS power_w
     FROM readings r JOIN devices d ON d.id = r.device_id
     WHERE d.space_id = ? AND r.ts >= ? AND r.ts <= ?
     GROUP BY 1 ORDER BY 1`,
  )
    .bind(space.id, from, to)
    .all<MetricValues & { ts: number }>();
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const body: ReadingsResponse = {
    space_id: space.id,
    step: q.step,
    points: rows.results.map((p) => ({
      ts: p.ts,
      co2_ppm: r2(p.co2_ppm),
      temp_c: r2(p.temp_c),
      rh_pct: r2(p.rh_pct),
      occupancy: Math.round(p.occupancy),
      power_w: r2(p.power_w),
    })),
  };
  return c.json(body);
});

const ForecastQuery = z.object({ metric: Metric.default("co2_ppm") });

publicRoutes.get("/spaces/:id/forecast", async (c) => {
  const { metric } = parseQuery(c, ForecastQuery);
  const result = await forecastForSpace(c.env, c.req.param("id"), metric, Date.now());
  if (!result) throw new HttpError(404, "Espacio no encontrado o sin datos suficientes");
  return c.json(result);
});
