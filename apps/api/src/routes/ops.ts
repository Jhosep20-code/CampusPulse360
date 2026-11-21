import { Hono } from "hono";
import { z } from "zod";
import { ChatRequest, ScenarioName, type AlertRule } from "@campuspulse/contracts";
import { audit, auditStmt } from "../lib/audit";
import { currentUser, requireRole } from "../auth/session";
import { safeJson, type AppEnv } from "../lib/db";
import { HttpError } from "../lib/problem";
import { rateLimit } from "../lib/rate-limit";
import { jsonBody } from "../lib/validate";
import { assistantChat } from "../ai/chat";
import { runIncidentBot } from "../engine/incident-bot";
import { runReportBot } from "../engine/report-bot";
import { applyScenario } from "../engine/scenarios";

export const opsRoutes = new Hono<AppEnv>();

/* ---------------------------------------------------------------- chat IA */

opsRoutes.post("/ai/chat", rateLimit("chat", 6), async (c) => {
  const req = await jsonBody(c, ChatRequest);
  return c.json(await assistantChat(c.env, req, Date.now()));
});

/* ---------------------------------------------------------------- reglas */

interface RuleRow extends Omit<AlertRule, "enabled"> {
  enabled: number;
}
const RULE_SQL = "SELECT id, name, metric, op, threshold, sustain_s, severity, enabled FROM alert_rules";
const toRule = (r: RuleRow): AlertRule => ({ ...r, enabled: r.enabled === 1 });

opsRoutes.get("/rules", async (c) => {
  const rows = await c.env.DB.prepare(`${RULE_SQL} ORDER BY id`).all<RuleRow>();
  return c.json({ items: rows.results.map(toRule) });
});

const RulePatch = z
  .object({ enabled: z.boolean().optional(), threshold: z.number().finite().optional() })
  .refine((v) => v.enabled !== undefined || v.threshold !== undefined, { message: "Indique enabled o threshold" });

opsRoutes.patch("/rules/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const user = currentUser(c);
  const patch = await jsonBody(c, RulePatch);
  const before = await c.env.DB.prepare(`${RULE_SQL} WHERE id = ?`).bind(id).first<RuleRow>();
  if (!before) throw new HttpError(404, "Regla no encontrada");
  const enabled = patch.enabled === undefined ? before.enabled : patch.enabled ? 1 : 0;
  const threshold = patch.threshold ?? before.threshold;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE alert_rules SET enabled = ?, threshold = ? WHERE id = ?").bind(enabled, threshold, id),
    auditStmt(c.env.DB, Date.now(), user.id, "rule.update", id, {
      before: { enabled: before.enabled === 1, threshold: before.threshold },
      after: { enabled: enabled === 1, threshold },
    }),
  ]);
  return c.json(toRule({ ...before, enabled, threshold }));
});

/* ---------------------------------------------------------------- bots */

opsRoutes.get("/bots/runs", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, bot, started_at, finished_at, status, summary FROM bot_runs ORDER BY started_at DESC LIMIT 50",
  ).all();
  return c.json({ items: rows.results });
});

const BotName = z.enum(["incident-bot", "report-bot"]);

opsRoutes.post("/bots/:name/run", requireRole("admin"), async (c) => {
  const name = BotName.safeParse(c.req.param("name"));
  if (!name.success) throw new HttpError(404, "Bot desconocido");
  const user = currentUser(c);
  const now = Date.now();
  const result = name.data === "incident-bot" ? await runIncidentBot(c.env, now) : await runReportBot(c.env, now);
  await audit(c.env.DB, Date.now(), user.id, "bot.run", name.data, { run_id: result.run_id, status: result.status });
  return c.json(result);
});

/* ---------------------------------------------------------------- reportes */

opsRoutes.get("/reports", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, kind, period_start, period_end, created_at FROM reports ORDER BY created_at DESC LIMIT 50",
  ).all();
  return c.json({ items: rows.results });
});

opsRoutes.get("/reports/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT id, kind, period_start, period_end, created_at, content_json FROM reports WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; kind: string; period_start: number; period_end: number; created_at: number; content_json: string }>();
  if (!row) throw new HttpError(404, "Reporte no encontrado");
  const { content_json, ...rest } = row;
  return c.json({ ...rest, content_json: safeJson(content_json) });
});

/* ---------------------------------------------------------------- escenarios */

opsRoutes.post("/scenarios/:name", requireRole("admin"), rateLimit("scenarios", 6), async (c) => {
  const name = ScenarioName.safeParse(c.req.param("name"));
  if (!name.success) throw new HttpError(404, "Escenario desconocido");
  const user = currentUser(c);
  const result = await applyScenario(c.env, name.data, Date.now(), user.id);
  await audit(c.env.DB, Date.now(), user.id, "scenario.apply", name.data, result);
  return c.json({ scenario: name.data, ...result });
});
