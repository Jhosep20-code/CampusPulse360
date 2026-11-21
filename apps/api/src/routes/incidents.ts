import { Hono } from "hono";
import {
  AiDiagnosis,
  AiProviderName,
  IncidentPatch,
  IncidentsQuery,
  type Incident,
  type IncidentEvent,
} from "@campuspulse/contracts";
import { auditStmt, audit } from "../lib/audit";
import { currentUser, requireRole } from "../auth/session";
import type { AppEnv } from "../lib/db";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import { HttpError } from "../lib/problem";
import { rateLimit } from "../lib/rate-limit";
import { jsonBody, parseQuery } from "../lib/validate";
import { diagnoseIncident } from "../engine/diagnose";

export const incidentRoutes = new Hono<AppEnv>();

interface IncidentRow {
  id: string;
  space_id: string;
  rule_id: string | null;
  title: string;
  status: Incident["status"];
  severity: Incident["severity"];
  opened_at: number;
  closed_at: number | null;
  output_json: string | null;
  valid_json: number | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_mode: string | null;
  ai_latency_ms: number | null;
  ai_created_at: number | null;
}

const SELECT_INCIDENT = `SELECT i.id, i.space_id, i.rule_id, i.title, i.status, i.severity, i.opened_at, i.closed_at,
    a.output_json, a.valid_json, a.provider AS ai_provider, a.model AS ai_model, a.mode AS ai_mode,
    a.latency_ms AS ai_latency_ms, a.created_at AS ai_created_at
  FROM incidents i LEFT JOIN ai_outputs a ON a.id = i.ai_output_id`;

function mapIncident(r: IncidentRow): Incident {
  let diagnosis: Incident["diagnosis"] = null;
  if (r.output_json && r.valid_json === 1) {
    try {
      const p = AiDiagnosis.safeParse(JSON.parse(r.output_json));
      if (p.success) diagnosis = p.data;
    } catch {
      diagnosis = null;
    }
  }
  let meta: Incident["diagnosis_meta"] = null;
  const provider = AiProviderName.safeParse(r.ai_provider);
  if (provider.success && r.ai_model && (r.ai_mode === "live" || r.ai_mode === "fallback") && r.ai_created_at !== null) {
    meta = {
      provider: provider.data,
      model: r.ai_model,
      mode: r.ai_mode,
      created_at: r.ai_created_at,
      latency_ms: r.ai_latency_ms,
    };
  }
  return {
    id: r.id,
    space_id: r.space_id,
    rule_id: r.rule_id,
    title: r.title,
    status: r.status,
    severity: r.severity,
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    diagnosis,
    diagnosis_meta: meta,
  };
}

async function loadDetail(env: Env, id: string): Promise<{ incident: Incident; events: IncidentEvent[] }> {
  const row = await env.DB.prepare(`${SELECT_INCIDENT} WHERE i.id = ?`).bind(id).first<IncidentRow>();
  if (!row) throw new HttpError(404, "Incidencia no encontrada");
  const ev = await env.DB.prepare(
    "SELECT id, incident_id, ts, kind, actor, detail FROM incident_events WHERE incident_id = ? ORDER BY ts, id",
  )
    .bind(id)
    .all<IncidentEvent>();
  return { incident: mapIncident(row), events: ev.results };
}

incidentRoutes.get("/incidents", async (c) => {
  const q = parseQuery(c, IncidentsQuery);
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (q.status) {
    conds.push("i.status = ?");
    binds.push(q.status);
  }
  if (q.space_id) {
    conds.push("i.space_id = ?");
    binds.push(q.space_id);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(`${SELECT_INCIDENT} ${where} ORDER BY i.opened_at DESC LIMIT ?`)
    .bind(...binds, q.limit)
    .all<IncidentRow>();
  return c.json({ items: rows.results.map(mapIncident) });
});

incidentRoutes.get("/incidents/:id", async (c) => {
  return c.json(await loadDetail(c.env, c.req.param("id")));
});

incidentRoutes.patch("/incidents/:id", requireRole("operator"), async (c) => {
  const id = c.req.param("id");
  const user = currentUser(c);
  const patch = await jsonBody(c, IncidentPatch);
  const cur = await loadDetail(c.env, id);
  const st = cur.incident.status;
  if (st === "resolved") throw new HttpError(409, "La incidencia ya esta resuelta");
  if (patch.status === "acknowledged" && st === "acknowledged") {
    throw new HttpError(409, "La incidencia ya fue reconocida");
  }
  const now = Date.now();
  const closedAt = patch.status === "resolved" ? now : null;
  const upd = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE incidents SET status = ?, closed_at = COALESCE(?, closed_at) WHERE id = ? AND status != 'resolved'").bind(
      patch.status,
      closedAt,
      id,
    ),
  ]);
  if ((upd[0]?.meta.changes ?? 0) !== 1) throw new HttpError(409, "La incidencia cambio de estado; reintente");
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO incident_events (id, ts, incident_id, kind, actor, detail) VALUES (?, ?, ?, ?, ?, ?)").bind(
      newId("evt"),
      now,
      id,
      patch.status,
      `${user.role}:${user.name}`,
      patch.comment ?? null,
    ),
    auditStmt(c.env.DB, now, user.id, `incident.${patch.status}`, id, { from: st, comment: patch.comment ?? null }),
  ]);
  return c.json(await loadDetail(c.env, id));
});

incidentRoutes.post("/incidents/:id/diagnose", requireRole("operator"), rateLimit("diagnose", 6), async (c) => {
  const id = c.req.param("id");
  const user = currentUser(c);
  const exists = await c.env.DB.prepare("SELECT 1 AS x FROM incidents WHERE id = ?").bind(id).first();
  if (!exists) throw new HttpError(404, "Incidencia no encontrada");
  const result = await diagnoseIncident(c.env, id, { force: true });
  await audit(c.env.DB, Date.now(), user.id, "incident.diagnose", id, { mode: result.meta.mode, provider: result.meta.provider });
  return c.json(result);
});
