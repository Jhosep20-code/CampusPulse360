import { Metric, OFFLINE_AFTER_MS, STATUS_THRESHOLDS, statusFromMetrics, type MetricValues, type SpaceStatus } from "@campuspulse/contracts";
import type { Env } from "../env";
import { forecastForSpace } from "../forecast/service";
import type { AiTool } from "./types";
import { round } from "./util";

/**
 * Herramientas de SOLO LECTURA del asistente. Cada una es una consulta fija y
 * parametrizada: el modelo nunca escribe SQL ni obtiene acceso de escritura.
 * Todos los datos provienen de telemetria SIMULADA.
 */
export const TOOL_NAMES = [
  "get_campus_status",
  "get_space_status",
  "list_spaces_at_risk",
  "get_open_incidents",
  "get_space_forecast",
  "find_spaces",
  "rank_spaces",
  "list_spaces_by_condition",
  "get_bot_activity",
  "get_ai_diagnoses",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const METRIC_ENUM = ["co2_ppm", "temp_c", "rh_pct", "occupancy", "power_w"];

export const ASSISTANT_TOOLS: AiTool[] = [
  {
    name: "get_campus_status",
    description: "Resumen general del campus: espacios por estado, ocupación total, promedios e incidencias abiertas.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_space_status",
    description: "Estado actual y últimas métricas de un espacio (por id, código o nombre).",
    parameters: {
      type: "object",
      properties: { space_id: { type: "string", description: "Id (SPC_3_A301), código (A301) o nombre del espacio." } },
      required: ["space_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_spaces_at_risk",
    description: "Lista los espacios en advertencia o crítico, opcionalmente priorizando una métrica.",
    parameters: {
      type: "object",
      properties: { metric: { type: "string", enum: METRIC_ENUM, description: "Métrica a priorizar (opcional)." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_open_incidents",
    description: "Incidencias activas (pendientes de IA, abiertas o reconocidas).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_space_forecast",
    description: "Previsión a 30 minutos (método Holt) de una métrica de un espacio.",
    parameters: {
      type: "object",
      properties: { space_id: { type: "string" }, metric: { type: "string", enum: METRIC_ENUM } },
      required: ["space_id", "metric"],
      additionalProperties: false,
    },
  },
  {
    name: "rank_spaces",
    description:
      "Ranking determinista de espacios por una métrica. occupancy_ratio = ocupación actual / aforo (porcentaje); occupancy = personas (absoluto); co2_ppm; temp_c; power_w (consumo eléctrico); rh_pct. Úsalo para 'el más/menos ...', aunque ningún espacio esté en riesgo.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["occupancy_ratio", "occupancy", "co2_ppm", "temp_c", "power_w", "rh_pct"] },
        order: { type: "string", enum: ["desc", "asc"] },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["metric"],
      additionalProperties: false,
    },
  },
  {
    name: "list_spaces_by_condition",
    description: "Espacios que cumplen una condición: over_capacity (más del 100 % del aforo), empty (ocupación 0) u offline (sin lecturas recientes).",
    parameters: {
      type: "object",
      properties: { condition: { type: "string", enum: ["over_capacity", "empty", "offline"] } },
      required: ["condition"],
      additionalProperties: false,
    },
  },
  {
    name: "get_bot_activity",
    description: "Acciones automáticas del bot RPA en las últimas 24 h: ejecuciones, incidencias abiertas y cerradas, diagnósticos pedidos.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_ai_diagnoses",
    description: "Últimos diagnósticos de incidencias generados por IA (o por el respaldo de reglas), con proveedor y modelo.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "find_spaces",
    description: "Busca espacios por texto libre (nombre, código, tipo o piso).",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ datos en vivo */

export interface SpaceLive {
  space_id: string;
  name: string;
  code: string;
  type: string;
  level: number;
  capacity: number;
  status: SpaceStatus;
  last_ts: number | null;
  metrics: MetricValues | null;
  occupancy_ratio: number | null;
}

interface LiveRow {
  space_id: string;
  name: string;
  code: string;
  type: string;
  capacity: number;
  level: number;
  ts: number | null;
  co2_ppm: number | null;
  temp_c: number | null;
  rh_pct: number | null;
  occupancy: number | null;
  power_w: number | null;
}

/** Ultima lectura (<= now) de cada espacio en una sola consulta; el estado se deriva con los umbrales del contrato. */
export async function loadLiveSpaces(env: Env, now: number): Promise<SpaceLive[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id AS space_id, s.name, s.code, s.type, s.capacity, f.level,
            r.ts, r.co2_ppm, r.temp_c, r.rh_pct, r.occupancy, r.power_w
       FROM spaces s
       JOIN floors f ON f.id = s.floor_id
       LEFT JOIN devices d ON d.space_id = s.id AND d.active = 1
       LEFT JOIN readings r ON r.device_id = d.id
            AND r.ts = (SELECT MAX(ts) FROM readings WHERE device_id = d.id AND ts <= ?1)
      ORDER BY f.level, s.id`,
  )
    .bind(now)
    .all<LiveRow>();
  const seen = new Set<string>();
  const out: SpaceLive[] = [];
  for (const r of results) {
    if (seen.has(r.space_id)) continue;
    seen.add(r.space_id);
    const metrics: MetricValues | null =
      r.ts !== null && r.co2_ppm !== null
        ? {
            co2_ppm: r.co2_ppm,
            temp_c: r.temp_c ?? 0,
            rh_pct: r.rh_pct ?? 0,
            occupancy: r.occupancy ?? 0,
            power_w: r.power_w ?? 0,
          }
        : null;
    out.push({
      space_id: r.space_id,
      name: r.name,
      code: r.code,
      type: r.type,
      level: r.level,
      capacity: r.capacity,
      status: statusFromMetrics(metrics, r.capacity, r.ts, now),
      last_ts: r.ts,
      metrics,
      occupancy_ratio: metrics ? round(metrics.occupancy / r.capacity, 2) : null,
    });
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function resolveSpace(spaces: SpaceLive[], token: unknown): SpaceLive | null {
  if (typeof token !== "string" || token.trim() === "") return null;
  const t = fold(token.trim());
  return (
    spaces.find((s) => fold(s.space_id) === t) ??
    spaces.find((s) => fold(s.code) === t) ??
    spaces.find((s) => fold(s.space_id).endsWith(`_${t}`)) ??
    spaces.find((s) => fold(s.name) === t) ??
    spaces.find((s) => t.length >= 3 && fold(s.name).includes(t)) ??
    null
  );
}

const METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  co2_ppm: { label: "CO2", unit: "ppm" },
  temp_c: { label: "temperatura", unit: "C" },
  rh_pct: { label: "humedad relativa", unit: "%" },
  occupancy: { label: "ocupación", unit: "personas" },
  power_w: { label: "potencia", unit: "W" },
};
const STATUS_ES: Record<SpaceStatus, string> = { ok: "normal", warning: "advertencia", critical: "crítico", offline: "sin datos recientes" };
const SEV_RANK: Record<SpaceStatus, number> = { ok: 0, warning: 1, critical: 2, offline: 0 };

function reasons(s: SpaceLive): string[] {
  if (!s.metrics) return [];
  const t = STATUS_THRESHOLDS;
  const out: string[] = [];
  if (s.metrics.co2_ppm >= t.co2_ppm.warning) out.push(`CO2 ${Math.round(s.metrics.co2_ppm)} ppm`);
  if (s.metrics.temp_c >= t.temp_c.warning) out.push(`temperatura ${round(s.metrics.temp_c, 1)} C`);
  if (s.occupancy_ratio !== null && s.occupancy_ratio >= t.occupancy_ratio.warning) {
    out.push(`ocupación ${Math.round(s.occupancy_ratio * 100)} % (${s.metrics.occupancy}/${s.capacity})`);
  }
  if (s.metrics.power_w >= t.power_w.warning) out.push(`consumo ${Math.round(s.metrics.power_w)} W`);
  return out;
}

function riskScore(s: SpaceLive, metric?: string): number {
  if (!s.metrics) return 0;
  const t = STATUS_THRESHOLDS;
  const co2 = s.metrics.co2_ppm / t.co2_ppm.critical;
  const temp = s.metrics.temp_c / t.temp_c.critical;
  const occ = (s.occupancy_ratio ?? 0) / t.occupancy_ratio.critical;
  if (metric === "co2_ppm") return co2;
  if (metric === "temp_c") return temp;
  const pw = s.metrics.power_w / t.power_w.critical;
  if (metric === "occupancy") return occ;
  if (metric === "power_w") return pw;
  return Math.max(co2, temp, occ, pw);
}

/* ------------------------------------------------------------------ ejecucion */

export type ToolResult = Record<string, unknown>;

export interface ToolExecution {
  name: ToolName;
  args: Record<string, unknown>;
  result: ToolResult;
}

const OPEN_SQL = "('pending_ai','open','acknowledged')";
const STOPWORDS = new Set(["de", "del", "el", "la", "los", "las", "en", "que", "cual", "cuales", "donde", "esta", "estan", "hay", "un", "una", "y", "o", "por", "me", "mi", "al"]);
const TYPE_WORDS: Record<string, string> = {
  classroom: "aula salon clase",
  lab: "laboratorio lab",
  library: "biblioteca",
  auditorium: "auditorio",
  lobby: "hall ingreso lobby entrada",
  office: "oficina oficinas administrativa",
};

const DAY_MS = 24 * 3_600_000;
export const RANK_METRICS = ["occupancy_ratio", "occupancy", "co2_ppm", "temp_c", "power_w", "rh_pct"] as const;
export type RankMetric = (typeof RANK_METRICS)[number];
const RANK_UNIT: Record<RankMetric, string> = { occupancy_ratio: "%", occupancy: "personas", co2_ppm: "ppm", temp_c: "C", power_w: "W", rh_pct: "%" };

/** Valor exacto (sin redondear) usado para ordenar; los empates se resuelven fuera. */
function rankValue(s: SpaceLive, metric: RankMetric): number {
  const m = s.metrics;
  if (!m) return Number.NEGATIVE_INFINITY;
  if (metric === "occupancy_ratio") return s.capacity > 0 ? m.occupancy / s.capacity : 0;
  return m[metric];
}

/** Fila de ranking con todos los datos que la respuesta debe citar (nombre, codigo, valores y porcentaje). */
function spaceRow(s: SpaceLive, metric: RankMetric) {
  const m = s.metrics;
  const ratio = m && s.capacity > 0 ? m.occupancy / s.capacity : null;
  return {
    space_id: s.space_id,
    code: s.code,
    name: s.name,
    level: s.level,
    status: s.status,
    capacity: s.capacity,
    occupancy: m?.occupancy ?? null,
    occupancy_pct: ratio === null ? null : round(ratio * 100, 1),
    value: !m ? null : metric === "occupancy_ratio" ? round((ratio ?? 0) * 100, 1) : metric === "temp_c" ? round(m.temp_c, 1) : Math.round(m[metric]),
    co2_ppm: m ? Math.round(m.co2_ppm) : null,
    temp_c: m ? round(m.temp_c, 1) : null,
    power_w: m ? Math.round(m.power_w) : null,
  };
}

function asMetric(v: unknown): Metric | undefined {
  const p = Metric.safeParse(v);
  return p.success ? p.data : undefined;
}

function atRisk(spaces: SpaceLive[], metric?: string) {
  return spaces
    .filter((s) => s.status === "warning" || s.status === "critical")
    .sort((a, b) => SEV_RANK[b.status] - SEV_RANK[a.status] || riskScore(b, metric) - riskScore(a, metric))
    .map((s) => ({
      space_id: s.space_id,
      name: s.name,
      status: s.status,
      reasons: reasons(s),
      co2_ppm: s.metrics ? Math.round(s.metrics.co2_ppm) : null,
      temp_c: s.metrics ? round(s.metrics.temp_c, 1) : null,
      occupancy_ratio: s.occupancy_ratio,
    }));
}

export async function runTool(env: Env, name: string, rawArgs: unknown, now: number): Promise<ToolExecution> {
  const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
  const tool = (TOOL_NAMES as readonly string[]).includes(name) ? (name as ToolName) : "get_campus_status";

  if (tool === "get_open_incidents") {
    const [list, counts] = await env.DB.batch([
      env.DB.prepare(
        `SELECT i.id, i.space_id, s.code, s.name, i.rule_id, i.title, i.severity, i.status, i.opened_at
           FROM incidents i JOIN spaces s ON s.id = i.space_id
          WHERE i.status IN ${OPEN_SQL}
          ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.opened_at DESC LIMIT 10`,
      ),
      env.DB.prepare(`SELECT severity, COUNT(*) AS n FROM incidents WHERE status IN ${OPEN_SQL} GROUP BY severity`),
    ]);
    const incidents = (list?.results ?? []) as Row[];
    const by = Object.fromEntries(((counts?.results ?? []) as Array<{ severity: string; n: number }>).map((r) => [r.severity, r.n]));
    const total = Object.values(by).reduce((n, x) => n + Number(x), 0);
    return {
      name: tool,
      args: {},
      result: { simulated: true, count: total, by_severity: { critical: by.critical ?? 0, warning: by.warning ?? 0, info: by.info ?? 0 }, incidents },
    };
  }

  const spaces = await loadLiveSpaces(env, now);

  if (tool === "get_campus_status") {
    const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM incidents WHERE status IN ${OPEN_SQL}`).first<{ n: number }>();
    const by = { ok: 0, warning: 0, critical: 0, offline: 0 };
    let occ = 0;
    let cap = 0;
    let co2Sum = 0;
    let tempSum = 0;
    let n = 0;
    for (const s of spaces) {
      by[s.status]++;
      cap += s.capacity;
      if (s.metrics) {
        occ += s.metrics.occupancy;
        co2Sum += s.metrics.co2_ppm;
        tempSum += s.metrics.temp_c;
        n++;
      }
    }
    return {
      name: tool,
      args: {},
      result: {
        simulated: true,
        spaces_total: spaces.length,
        by_status: by,
        occupancy_total: occ,
        capacity_total: cap,
        avg_co2_ppm: n ? Math.round(co2Sum / n) : null,
        avg_temp_c: n ? round(tempSum / n, 1) : null,
        open_incidents: open?.n ?? 0,
        spaces_at_risk: atRisk(spaces).slice(0, 5),
        highest_occupancy: (() => {
          const top = spaces.filter((s) => s.status !== "offline" && s.metrics).sort((a, b) => rankValue(b, "occupancy_ratio") - rankValue(a, "occupancy_ratio"))[0];
          return top ? spaceRow(top, "occupancy_ratio") : null;
        })(),
      },
    };
  }

  if (tool === "list_spaces_at_risk") {
    const metric = asMetric(args.metric);
    const list = atRisk(spaces, metric);
    return {
      name: tool,
      args: metric ? { metric } : {},
      result: { simulated: true, metric: metric ?? null, none_at_risk: list.length === 0, spaces: list.slice(0, 5) },
    };
  }

  if (tool === "get_space_status") {
    const s = resolveSpace(spaces, args.space_id);
    if (!s) return { name: tool, args, result: { found: false, query: String(args.space_id ?? "") } };
    const inc = await env.DB.prepare(
      `SELECT id, title, severity, status FROM incidents WHERE space_id = ?1 AND status IN ${OPEN_SQL} ORDER BY opened_at DESC LIMIT 5`,
    )
      .bind(s.space_id)
      .all<{ id: string; title: string; severity: string; status: string }>();
    return {
      name: tool,
      args: { space_id: s.space_id },
      result: {
        found: true,
        simulated: true,
        space_id: s.space_id,
        name: s.name,
        type: s.type,
        level: s.level,
        capacity: s.capacity,
        status: s.status,
        last_ts: s.last_ts,
        metrics: s.metrics,
        occupancy_ratio: s.occupancy_ratio,
        open_incidents: inc.results,
      },
    };
  }

  if (tool === "get_space_forecast") {
    const s = resolveSpace(spaces, args.space_id);
    const metric = asMetric(args.metric) ?? "co2_ppm";
    if (!s) return { name: tool, args, result: { found: false, query: String(args.space_id ?? "") } };
    const f = await forecastForSpace(env, s.space_id, metric, now);
    if (!f || f.history.length === 0) {
      return { name: tool, args: { space_id: s.space_id, metric }, result: { found: false, space_id: s.space_id, name: s.name, metric, reason: "sin datos suficientes" } };
    }
    const last = f.history[f.history.length - 1]?.value ?? 0;
    const end = f.forecast[f.forecast.length - 1]?.value ?? last;
    const delta = end - last;
    const trend = Math.abs(delta) <= 0.02 * Math.max(Math.abs(last), 1) ? "estable" : delta > 0 ? "sube" : "baja";
    return {
      name: tool,
      args: { space_id: s.space_id, metric },
      result: {
        found: true,
        simulated: true,
        space_id: s.space_id,
        name: s.name,
        metric,
        horizon_min: f.horizon_min,
        mae: f.mae,
        last_value: last,
        forecast: f.forecast.filter((_, i) => i === 1 || i === 3 || i === 5).map((p, i) => ({ minutes_ahead: (i + 1) * 10, value: p.value })),
        trend,
      },
    };
  }

  if (tool === "rank_spaces") {
    const metric = RANK_METRICS.includes(args.metric as RankMetric) ? (args.metric as RankMetric) : "occupancy_ratio";
    const order: "desc" | "asc" = args.order === "asc" ? "asc" : "desc";
    const limit = Math.min(10, Math.max(1, Number.isInteger(args.limit) ? (args.limit as number) : 5));
    const online = spaces.filter((s) => s.status !== "offline" && s.metrics);
    const offline = spaces.filter((s) => !(s.status !== "offline" && s.metrics));
    const sorted = [...online].sort((a, b) => {
      const d = rankValue(b, metric) - rankValue(a, metric);
      const tie = (b.metrics?.occupancy ?? 0) - (a.metrics?.occupancy ?? 0) || a.code.localeCompare(b.code);
      return (order === "desc" ? d : -d) || tie;
    });
    const ranking = sorted.slice(0, limit).map((s) => spaceRow(s, metric));
    const top = ranking[0] ?? null;
    // Para ocupacion relativa, informar tambien quien tiene mas personas (concepto distinto).
    const absTop = metric === "occupancy_ratio" && order === "desc" ? [...online].sort((a, b) => (b.metrics?.occupancy ?? 0) - (a.metrics?.occupancy ?? 0))[0] : undefined;
    return {
      name: tool,
      args: { metric, order, limit },
      result: {
        simulated: true,
        metric,
        order,
        unit: RANK_UNIT[metric],
        spaces_considered: online.length,
        no_data: online.length === 0,
        top,
        ranking,
        over_capacity_count: online.filter((s) => (s.metrics?.occupancy ?? 0) > s.capacity).length,
        absolute_top: absTop ? spaceRow(absTop, "occupancy") : null,
        excluded_offline: offline.map((s) => ({ space_id: s.space_id, code: s.code, name: s.name })),
      },
    };
  }

  if (tool === "list_spaces_by_condition") {
    const condition = ["over_capacity", "empty", "offline"].includes(String(args.condition)) ? String(args.condition) : "over_capacity";
    const online = spaces.filter((s) => s.status !== "offline" && s.metrics);
    if (condition === "offline") {
      const off = spaces.filter((s) => s.status === "offline");
      const devs = await env.DB.prepare("SELECT id, space_id, active FROM devices ORDER BY id").all<{ id: string; space_id: string; active: number }>();
      return {
        name: tool,
        args: { condition },
        result: {
          simulated: true,
          condition,
          offline_after_min: OFFLINE_AFTER_MS / 60_000,
          count: off.length,
          devices_total: devs.results.length,
          spaces: off.map((s) => ({
            space_id: s.space_id,
            code: s.code,
            name: s.name,
            level: s.level,
            devices: devs.results.filter((d) => d.space_id === s.space_id).map((d) => d.id),
            last_ts: s.last_ts,
            minutes_since_last: s.last_ts === null ? null : Math.floor((now - s.last_ts) / 60_000),
          })),
        },
      };
    }
    if (condition === "empty") {
      const empty = online.filter((s) => s.metrics?.occupancy === 0);
      return {
        name: tool,
        args: { condition },
        result: { simulated: true, condition, count: empty.length, spaces_considered: online.length, spaces: empty.map((s) => spaceRow(s, "occupancy")) },
      };
    }
    // over_capacity: estrictamente mas personas que el aforo (> 100 %).
    const over = online.filter((s) => (s.metrics?.occupancy ?? 0) > s.capacity).sort((a, b) => rankValue(b, "occupancy_ratio") - rankValue(a, "occupancy_ratio"));
    const atLimit = online.filter((s) => (s.metrics?.occupancy ?? 0) === s.capacity && s.capacity > 0);
    const top = [...online].sort((a, b) => rankValue(b, "occupancy_ratio") - rankValue(a, "occupancy_ratio"))[0];
    return {
      name: tool,
      args: { condition },
      result: {
        simulated: true,
        condition,
        count: over.length,
        spaces_considered: online.length,
        spaces: over.map((s) => spaceRow(s, "occupancy_ratio")),
        at_capacity: atLimit.map((s) => spaceRow(s, "occupancy_ratio")),
        highest_ratio: top ? spaceRow(top, "occupancy_ratio") : null,
      },
    };
  }

  if (tool === "get_bot_activity") {
    const since = now - DAY_MS;
    const [runs, events, last] = await env.DB.batch([
      env.DB.prepare("SELECT bot, status, COUNT(*) AS n FROM bot_runs WHERE started_at >= ?1 AND started_at <= ?2 GROUP BY bot, status").bind(since, now),
      env.DB.prepare(
        "SELECT kind, COUNT(*) AS n FROM incident_events WHERE ts >= ?1 AND ts <= ?2 AND kind IN ('opened','resolved','diagnosed','notified') GROUP BY kind",
      ).bind(since, now),
      env.DB.prepare("SELECT bot, started_at, status, summary FROM bot_runs WHERE started_at <= ?1 ORDER BY started_at DESC LIMIT 3").bind(now),
    ]);
    const runRows = (runs?.results ?? []) as Array<{ bot: string; status: string; n: number }>;
    const ev = Object.fromEntries(((events?.results ?? []) as Array<{ kind: string; n: number }>).map((r) => [r.kind, r.n]));
    const byBot: Record<string, Record<string, number>> = {};
    for (const r of runRows) (byBot[r.bot] ??= {})[r.status] = r.n;
    return {
      name: tool,
      args: {},
      result: {
        simulated: true,
        window_h: 24,
        runs_total: runRows.reduce((n, r) => n + r.n, 0),
        runs_by_bot: byBot,
        incidents_opened: ev.opened ?? 0,
        incidents_auto_resolved: ev.resolved ?? 0,
        diagnoses: ev.diagnosed ?? 0,
        notifications: ev.notified ?? 0,
        last_runs: (last?.results ?? []) as Row[],
      },
    };
  }

  if (tool === "get_ai_diagnoses") {
    const { results } = await env.DB.prepare(
      `SELECT o.incident_id, o.provider, o.model, o.mode, o.created_at, o.output_json, i.title, i.severity, i.status, s.id AS space_id, s.code, s.name
         FROM ai_outputs o
         JOIN incidents i ON i.id = o.incident_id
         JOIN spaces s ON s.id = i.space_id
        WHERE o.prompt_id = 'diagnose' AND o.valid_json = 1 AND o.created_at <= ?1
        ORDER BY o.created_at DESC LIMIT 5`,
    )
      .bind(now)
      .all<{ incident_id: string; provider: string; model: string; mode: string; created_at: number; output_json: string | null; title: string; severity: string; status: string; space_id: string; code: string; name: string }>();
    const items = results.map((r) => {
      let causa: string | null = null;
      let sev: string | null = null;
      try {
        const o = JSON.parse(r.output_json ?? "{}") as { causa_probable?: unknown; severidad?: unknown };
        causa = typeof o.causa_probable === "string" ? o.causa_probable.slice(0, 240) : null;
        sev = typeof o.severidad === "string" ? o.severidad : null;
      } catch {
        /* salida no parseable: se informa sin causa */
      }
      return {
        incident_id: r.incident_id,
        space_id: r.space_id,
        code: r.code,
        name: r.name,
        title: r.title,
        incident_status: r.status,
        provider: r.provider,
        model: r.model,
        mode: r.mode,
        created_at: r.created_at,
        causa_probable: causa,
        severidad: sev ?? r.severity,
      };
    });
    return {
      name: tool,
      args: {},
      result: { simulated: true, count: items.length, live: items.filter((i) => i.mode === "live").length, fallback: items.filter((i) => i.mode === "fallback").length, diagnoses: items },
    };
  }

  // find_spaces
  const query = typeof args.query === "string" ? args.query : "";
  const foldedQuery = fold(query);
  const pisoMatch = /piso\s*(\d{1,2})/.exec(foldedQuery);
  const level = pisoMatch ? Number(pisoMatch[1]) : null;
  const tokens = foldedQuery
    .split(/[^a-z0-9_]+/)
    .filter((t) => t && !STOPWORDS.has(t) && !(level !== null && (t === "piso" || t === String(level))));
  const scored = spaces
    .filter((s) => level === null || s.level === level)
    .map((s) => {
      const hay = fold(`${s.space_id} ${s.code} ${s.name} ${s.type} ${TYPE_WORDS[s.type] ?? ""}`);
      let score = level !== null && tokens.length === 0 ? 1 : 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += t.length >= 3 ? 2 : 1;
      }
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return {
    name: tool,
    args: { query },
    result: {
      count: scored.length,
      spaces: scored.map(({ s }) => ({ space_id: s.space_id, name: s.name, type: s.type, level: s.level, capacity: s.capacity, status: s.status })),
    },
  };
}

/* ------------------------------------------------------------------ redaccion determinista */

export interface RenderedAnswer {
  answer: string;
  citations: string[];
  focus_space_ids: string[];
}

type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const SEV_ES: Record<string, string> = { critical: "crítica", warning: "advertencia", info: "informativa", alta: "alta", media: "media", baja: "baja", critica: "crítica" };
const INC_STATUS_ES: Record<string, string> = { pending_ai: "pendiente de diagnóstico", open: "abierta", acknowledged: "reconocida", resolved: "resuelta" };
const RUN_STATUS_ES: Record<string, string> = { success: "correctas", partial: "parciales", failed: "fallidas", running: "en curso" };
// Formato fijo (sin Intl) para que la salida sea identica en el Worker, en las pruebas y en la evaluacion.
const fmtInt = (n: unknown) => (typeof n === "number" ? String(Math.round(n)) : "s/d");
const pct = (n: unknown) => (typeof n === "number" ? `${String(round(n, 1)).replace(".", ",")} %` : "s/d");

/** "Aula A301 (A301, piso 3)". */
function label(s: Row): string {
  return `${str(s.name)} (${str(s.code)}, piso ${s.level})`;
}
function occText(s: Row): string {
  return `${s.occupancy}/${s.capacity} personas = ${pct(s.occupancy_pct)} del aforo`;
}
function metricText(s: Row, metric: string): string {
  if (metric === "occupancy_ratio") return occText(s);
  if (metric === "occupancy") return `${s.occupancy} personas (${pct(s.occupancy_pct)} de su aforo de ${s.capacity})`;
  if (metric === "co2_ppm") return `CO2 ${fmtInt(s.value)} ppm`;
  if (metric === "temp_c") return `${String(s.value).replace(".", ",")} °C`;
  if (metric === "power_w") return `${fmtInt(s.value)} W`;
  return `${s.value} %`;
}
const RANK_PHRASE: Record<string, [string, string]> = {
  occupancy_ratio: ["El espacio más ocupado respecto a su aforo", "El espacio menos ocupado respecto a su aforo"],
  occupancy: ["El espacio con más personas (ocupación absoluta)", "El espacio con menos personas (ocupación absoluta)"],
  co2_ppm: ["El espacio con el CO2 más alto", "El espacio con el CO2 más bajo"],
  temp_c: ["El espacio con la temperatura más alta", "El espacio con la temperatura más baja"],
  power_w: ["El espacio con mayor consumo eléctrico", "El espacio con menor consumo eléctrico"],
  rh_pct: ["El espacio con mayor humedad relativa", "El espacio con menor humedad relativa"],
};

function renderRanking(result: ToolResult, SIM: string): RenderedAnswer {
  const metric = str(result.metric);
  const list = arr(result.ranking);
  const offline = arr(result.excluded_offline);
  const offNote = offline.length ? ` Sin lecturas recientes (excluidos del cálculo): ${offline.map((s) => str(s.code)).join(", ")}.` : "";
  const top = list[0];
  if (!top) return { answer: `No hay lecturas recientes para calcular este ranking ${SIM}.${offNote}`, citations: [], focus_space_ids: [] };
  const phrase = (RANK_PHRASE[metric] ?? ["El primero", "El último"])[result.order === "asc" ? 1 : 0];
  const parts = [`${phrase} es ${label(top)}: ${metricText(top, metric)}, estado ${STATUS_ES[str(top.status) as SpaceStatus] ?? str(top.status)} ${SIM}.`];
  if (metric === "occupancy_ratio" && result.order !== "asc") {
    const over = Number(result.over_capacity_count ?? 0);
    parts.push(over === 0 ? "Ningún espacio supera el 100 % de su aforo." : `${over} espacio(s) superan su aforo (más del 100 %).`);
    const abs = result.absolute_top as Row | null;
    if (abs && str(abs.space_id) !== str(top.space_id)) {
      parts.push(`En número absoluto de personas, el mayor es ${label(abs)} con ${abs.occupancy} personas (${pct(abs.occupancy_pct)} de su aforo de ${abs.capacity}).`);
    }
  }
  if (metric !== "occupancy_ratio" && metric !== "occupancy" && top.occupancy !== null) {
    parts.push(`Ocupación del espacio: ${occText(top)}.`);
  }
  const rest = list.slice(1);
  const restText = rest.length ? `\nSiguientes:\n${rest.map((s, i) => `${i + 2}. ${label(s)}: ${metricText(s, metric)}`).join("\n")}` : "";
  const id = str(top.space_id);
  return { answer: `${parts.join(" ")}${offNote}${restText}`, citations: list.map((s) => str(s.space_id)), focus_space_ids: [id] };
}

function renderCondition(result: ToolResult, SIM: string): RenderedAnswer {
  const cond = str(result.condition);
  const list = arr(result.spaces);
  const ids = list.map((s) => str(s.space_id));
  if (cond === "offline") {
    if (list.length === 0) {
      return { answer: `Todos los dispositivos están reportando: ningún espacio lleva más de ${result.offline_after_min} min sin lecturas ${SIM}.`, citations: [], focus_space_ids: [] };
    }
    const lines = list.map((s) => {
      const since = s.minutes_since_last === null ? "sin lecturas registradas" : `última lectura hace ${s.minutes_since_last} min`;
      const devs = Array.isArray(s.devices) && s.devices.length ? (s.devices as string[]).join(", ") : "sin dispositivo activo";
      return `- ${label(s)}: dispositivo ${devs}, ${since}`;
    });
    return {
      answer: `${list.length} espacio(s) con dispositivos desconectados (más de ${result.offline_after_min} min sin reportar) ${SIM}:\n${lines.join("\n")}`,
      citations: ids,
      focus_space_ids: ids,
    };
  }
  if (cond === "empty") {
    if (list.length === 0) return { answer: `No hay espacios vacíos: todos los espacios con lecturas recientes tienen al menos una persona ${SIM}.`, citations: [], focus_space_ids: [] };
    return {
      answer: `${list.length} espacio(s) vacíos (ocupación 0) ${SIM}:\n${list.map((s) => `- ${label(s)}: 0/${s.capacity} personas`).join("\n")}`,
      citations: ids,
      focus_space_ids: ids,
    };
  }
  if (list.length === 0) {
    const top = result.highest_ratio as Row | null;
    const atCap = arr(result.at_capacity);
    const capNote = atCap.length ? ` Al límite exacto del aforo (100 %): ${atCap.map((s) => str(s.code)).join(", ")}.` : "";
    const topNote = top ? ` El más cercano es ${label(top)}: ${occText(top)}.` : "";
    return {
      answer: `Ningún espacio supera su aforo (más del 100 %) ${SIM}.${topNote}${capNote}`,
      citations: top ? [str(top.space_id)] : [],
      focus_space_ids: top ? [str(top.space_id)] : [],
    };
  }
  return {
    answer: `${list.length} espacio(s) en sobreaforo (más del 100 % de su aforo) ${SIM}:\n${list.map((s) => `- ${label(s)}: ${occText(s)}, estado ${STATUS_ES[str(s.status) as SpaceStatus] ?? str(s.status)}`).join("\n")}`,
    citations: ids,
    focus_space_ids: ids,
  };
}

/** Redacta en español, sin IA, la respuesta a partir del resultado de una herramienta. */
export function renderToolAnswer(name: string, result: ToolResult): RenderedAnswer {
  const SIM = "(datos simulados)";
  if (name === "list_spaces_at_risk") {
    const list = arr(result.spaces);
    if (list.length === 0) {
      return { answer: `Ningún espacio supera hoy los umbrales de advertencia ${SIM}.`, citations: [], focus_space_ids: [] };
    }
    const lines = list.map((s) => {
      const r = Array.isArray(s.reasons) ? (s.reasons as string[]).join(", ") : "";
      return `- ${str(s.name)} (${str(s.space_id)}): ${STATUS_ES[str(s.status) as SpaceStatus] ?? str(s.status)}${r ? ` - ${r}` : ""}`;
    });
    const ids = list.map((s) => str(s.space_id));
    return { answer: `Espacios en riesgo ${SIM}:\n${lines.join("\n")}`, citations: ids, focus_space_ids: ids };
  }
  if (name === "get_campus_status") {
    const by = (result.by_status ?? {}) as Record<string, number>;
    const risk = arr(result.spaces_at_risk);
    const ids = risk.map((s) => str(s.space_id));
    const extra = risk.length
      ? ` En riesgo: ${risk.map((s) => `${str(s.name)} (${str(s.space_id).split("_").slice(2).join("_")}${Array.isArray(s.reasons) && s.reasons.length ? `: ${(s.reasons as string[]).join(", ")}` : ""})`).join("; ")}.`
      : " Ningún espacio en riesgo.";
    const hi = result.highest_occupancy as Row | null;
    const hiText = hi ? ` Mayor ocupación relativa: ${label(hi)}, ${occText(hi)}.` : "";
    const totalPct = Number(result.capacity_total) > 0 ? ` (${pct(round((Number(result.occupancy_total) / Number(result.capacity_total)) * 100, 1))} del aforo total)` : "";
    return {
      answer: `Campus ${SIM}: ${result.spaces_total} espacios (${by.ok ?? 0} normales, ${by.warning ?? 0} en advertencia, ${by.critical ?? 0} críticos, ${by.offline ?? 0} sin datos). Ocupación ${result.occupancy_total}/${result.capacity_total} personas${totalPct}, CO2 promedio ${result.avg_co2_ppm ?? "s/d"} ppm, temperatura media ${result.avg_temp_c ?? "s/d"} C, ${result.open_incidents} incidencias activas.${hiText}${extra}`,
      citations: ids,
      focus_space_ids: ids,
    };
  }
  if (name === "get_space_status") {
    if (!result.found) return { answer: `No encontré un espacio que coincida con "${str(result.query)}".`, citations: [], focus_space_ids: [] };
    const m = result.metrics as MetricValues | null;
    const id = str(result.space_id);
    const incs = arr(result.open_incidents);
    const body = m
      ? `CO2 ${Math.round(m.co2_ppm)} ppm, temperatura ${round(m.temp_c, 1)} C, humedad ${Math.round(m.rh_pct)} %, ocupación ${m.occupancy}/${result.capacity}.`
      : "No hay lecturas recientes.";
    return {
      answer: `${str(result.name)} (${id}) ${SIM}: estado ${STATUS_ES[str(result.status) as SpaceStatus] ?? str(result.status)}. ${body}${incs.length ? ` Incidencias activas: ${incs.map((i) => str(i.title)).join("; ")}.` : ""}`,
      citations: [id],
      focus_space_ids: [id],
    };
  }
  if (name === "get_open_incidents") {
    const list = arr(result.incidents);
    if (list.length === 0) return { answer: `No hay incidencias activas ${SIM}.`, citations: [], focus_space_ids: [] };
    const ids = [...new Set(list.map((i) => str(i.space_id)))];
    const by = (result.by_severity ?? {}) as Record<string, number>;
    const head = `${result.count ?? list.length} incidencias activas ${SIM}: ${by.critical ?? 0} críticas, ${by.warning ?? 0} de advertencia${by.info ? `, ${by.info} informativas` : ""}.`;
    const lines = list.map(
      (i) => `- [${SEV_ES[str(i.severity)] ?? str(i.severity)}] ${str(i.name)} (${str(i.code)}): ${str(i.title)} — ${INC_STATUS_ES[str(i.status)] ?? str(i.status)}`,
    );
    return { answer: `${head}\n${lines.join("\n")}`, citations: ids, focus_space_ids: ids };
  }
  if (name === "rank_spaces") return renderRanking(result, SIM);
  if (name === "list_spaces_by_condition") return renderCondition(result, SIM);
  if (name === "get_bot_activity") {
    const runs = Number(result.runs_total ?? 0);
    const byBot = (result.runs_by_bot ?? {}) as Record<string, Record<string, number>>;
    const bots = Object.entries(byBot)
      .map(([b, st]) => `${b}: ${Object.entries(st).map(([k, n]) => `${n} ${RUN_STATUS_ES[k] ?? k}`).join(", ")}`)
      .join("; ");
    const lastRun = arr(result.last_runs)[0];
    const last = lastRun ? ` Última ejecución: ${str(lastRun.bot)} (${RUN_STATUS_ES[str(lastRun.status)] ?? str(lastRun.status)}) — «${str(lastRun.summary) || "sin resumen"}».` : "";
    if (runs === 0) return { answer: `El bot no registró ejecuciones en las últimas 24 h ${SIM}.${last}`, citations: [], focus_space_ids: [] };
    return {
      answer: `Acciones automáticas del bot en las últimas 24 h ${SIM}: ${runs} ejecuciones (${bots}). Incidencias abiertas por el bot: ${result.incidents_opened}; cerradas automáticamente al normalizarse: ${result.incidents_auto_resolved}; diagnósticos generados: ${result.diagnoses}; notificaciones enviadas: ${result.notifications}.${last}`,
      citations: [],
      focus_space_ids: [],
    };
  }
  if (name === "get_ai_diagnoses") {
    const list = arr(result.diagnoses);
    if (list.length === 0) return { answer: `Todavía no hay diagnósticos de incidencias registrados ${SIM}.`, citations: [], focus_space_ids: [] };
    const ids = [...new Set(list.map((d) => str(d.space_id)))];
    const lines = list.map((d) => {
      const who = str(d.mode) === "live" ? `IA ${str(d.provider)} · ${str(d.model)}` : `respaldo por reglas (sin IA, ${str(d.model)})`;
      return `- ${str(d.name)} (${str(d.code)}) — ${str(d.title)}: ${str(d.causa_probable) || "sin causa registrada"} [${SEV_ES[str(d.severidad)] ?? str(d.severidad)}; ${who}]`;
    });
    return {
      answer: `Últimos ${list.length} diagnósticos ${SIM} (${result.live ?? 0} por IA, ${result.fallback ?? 0} por reglas):\n${lines.join("\n")}`,
      citations: ids,
      focus_space_ids: ids,
    };
  }
  if (name === "get_space_forecast") {
    if (!result.found) return { answer: `No hay datos suficientes para pronosticar${result.name ? ` en ${str(result.name)}` : ""}.`, citations: [], focus_space_ids: [] };
    const m = METRIC_LABEL[str(result.metric)] ?? { label: str(result.metric), unit: "" };
    const pts = arr(result.forecast);
    const end = pts[pts.length - 1];
    const id = str(result.space_id);
    return {
      answer: `Previsión Holt ${SIM} para ${str(result.name)} (${m.label}): valor actual ${result.last_value} ${m.unit}; a ${end?.minutes_ahead ?? result.horizon_min} min se estima ${end?.value ?? "s/d"} ${m.unit} (tendencia: ${str(result.trend)}). Error medio del backtest: ${result.mae ?? "sin datos suficientes"}.`,
      citations: [id],
      focus_space_ids: [id],
    };
  }
  if (name === "find_spaces") {
    const list = arr(result.spaces);
    if (list.length === 0) return { answer: "No encontré espacios que coincidan con tu búsqueda.", citations: [], focus_space_ids: [] };
    const ids = list.map((s) => str(s.space_id));
    return {
      answer: `Espacios encontrados:\n${list.map((s) => `- ${str(s.name)} (${str(s.space_id)}), piso ${s.level}, aforo ${s.capacity}`).join("\n")}`,
      citations: ids,
      focus_space_ids: ids,
    };
  }
  return { answer: `Sin información disponible ${SIM}.`, citations: [], focus_space_ids: [] };
}
