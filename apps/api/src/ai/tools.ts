import { Metric, STATUS_THRESHOLDS, statusFromMetrics, type MetricValues, type SpaceStatus } from "@campuspulse/contracts";
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
  if (metric === "occupancy") return occ;
  return Math.max(co2, temp, occ);
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
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.space_id, i.title, i.severity, i.status, i.opened_at
         FROM incidents i WHERE i.status IN ${OPEN_SQL} ORDER BY i.opened_at DESC LIMIT 10`,
    ).all<{ id: string; space_id: string; title: string; severity: string; status: string; opened_at: number }>();
    return { name: tool, args: {}, result: { simulated: true, count: results.length, incidents: results } };
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
    const extra = risk.length ? ` En riesgo: ${risk.map((s) => str(s.name)).join(", ")}.` : " Ningún espacio en riesgo.";
    return {
      answer: `Campus ${SIM}: ${result.spaces_total} espacios (${by.ok ?? 0} normales, ${by.warning ?? 0} en advertencia, ${by.critical ?? 0} críticos, ${by.offline ?? 0} sin datos). Ocupación ${result.occupancy_total}/${result.capacity_total} personas, CO2 promedio ${result.avg_co2_ppm ?? "s/d"} ppm, temperatura media ${result.avg_temp_c ?? "s/d"} C, ${result.open_incidents} incidencias activas.${extra}`,
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
    return {
      answer: `Incidencias activas ${SIM}:\n${list.map((i) => `- ${str(i.title)} (${str(i.severity)}, ${str(i.status)})`).join("\n")}`,
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
