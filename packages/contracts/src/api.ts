import { z } from "zod";
import {
  Building,
  DataSource,
  EpochMs,
  Floor,
  IncidentStatus,
  MeshId,
  Metric,
  MetricValues,
  Role,
  Severity,
  Space,
  SpaceStatus,
} from "./domain";

export const API_PREFIX = "/api/v1";

/* ---------------------------------------------------------------- errores */

/** RFC 7807 Problem Details. */
export const Problem = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof Problem>;

/* ---------------------------------------------------------------- ingesta */

/**
 * POST /api/v1/ingest
 * Cabeceras: X-Gateway-Id, X-Timestamp (epoch ms), X-Signature
 * X-Signature = hex(HMAC-SHA256(clave_gateway, `${X-Timestamp}.${cuerpo_crudo}`))
 * Ventana anti-replay: +-60 s.
 */
export const INGEST_MAX_SKEW_MS = 60_000;
export const INGEST_MAX_READINGS = 120;

export const IngestReading = MetricValues.extend({
  device_id: z.string().min(1).max(64),
  ts: EpochMs,
});
export type IngestReading = z.infer<typeof IngestReading>;

export const IngestBatch = z.object({
  gateway_id: z.string().min(1).max(64),
  source: DataSource.default("sim"),
  readings: z.array(IngestReading).min(1).max(INGEST_MAX_READINGS),
});
export type IngestBatch = z.infer<typeof IngestBatch>;

export const IngestResult = z.object({
  accepted: z.number().int(),
  rejected: z.array(z.object({ device_id: z.string(), reason: z.string() })),
});
export type IngestResult = z.infer<typeof IngestResult>;

/* ---------------------------------------------------------------- campus */

export const CampusResponse = z.object({
  building: Building,
  floors: z.array(Floor),
  spaces: z.array(Space),
});
export type CampusResponse = z.infer<typeof CampusResponse>;

/* ---------------------------------------------------------------- live */

export const LiveSpace = z.object({
  space_id: z.string(),
  mesh_id: MeshId,
  status: SpaceStatus,
  last_ts: EpochMs.nullable(),
  source: DataSource.nullable(),
  metrics: MetricValues.nullable(),
});
export type LiveSpace = z.infer<typeof LiveSpace>;

export const LiveSnapshot = z.object({
  generated_at: EpochMs,
  /** Siempre true mientras no existan sensores fisicos. */
  simulated: z.boolean(),
  kpis: z.object({
    spaces_total: z.number().int(),
    spaces_ok: z.number().int(),
    spaces_warning: z.number().int(),
    spaces_critical: z.number().int(),
    spaces_offline: z.number().int(),
    occupancy_total: z.number().int(),
    capacity_total: z.number().int(),
    avg_co2_ppm: z.number().nullable(),
    avg_temp_c: z.number().nullable(),
    power_total_w: z.number().nullable(),
    open_incidents: z.number().int(),
  }),
  spaces: z.array(LiveSpace),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

/* ---------------------------------------------------------------- series */

export const ReadingsQuery = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  /** Paso de agregacion en segundos (60..3600). */
  step: z.coerce.number().int().min(60).max(3600).default(300),
});
export type ReadingsQuery = z.infer<typeof ReadingsQuery>;

export const ReadingPoint = MetricValues.extend({ ts: EpochMs });
export type ReadingPoint = z.infer<typeof ReadingPoint>;

export const ReadingsResponse = z.object({
  space_id: z.string(),
  step: z.number().int(),
  points: z.array(ReadingPoint),
});
export type ReadingsResponse = z.infer<typeof ReadingsResponse>;

export const ForecastResponse = z.object({
  space_id: z.string(),
  metric: Metric,
  method: z.literal("holt"),
  horizon_min: z.number().int(),
  /** MAE del backtest sobre datos SIMULADOS; null si no hay datos suficientes. */
  mae: z.number().nullable(),
  history: z.array(z.object({ ts: EpochMs, value: z.number() })),
  forecast: z.array(z.object({ ts: EpochMs, value: z.number() })),
});
export type ForecastResponse = z.infer<typeof ForecastResponse>;

/* ---------------------------------------------------------------- IA */

export const AiProviderName = z.enum(["workers-ai", "openai", "rules-fallback", "mock"]);
export type AiProviderName = z.infer<typeof AiProviderName>;

/** Salida estructurada del prompt de diagnostico (validada con zod). */
export const AiDiagnosis = z.object({
  causa_probable: z.string().min(3).max(600),
  severidad: Severity,
  acciones: z.array(z.string().min(2).max(300)).min(1).max(6),
  evidencia: z
    .array(z.object({ device_id: z.string(), metric: Metric, valor: z.number() }))
    .max(10),
  confianza: z.number().min(0).max(1),
});
export type AiDiagnosis = z.infer<typeof AiDiagnosis>;

export const AiOutputMeta = z.object({
  provider: AiProviderName,
  model: z.string(),
  /** live = inferencia real ahora; fallback = reglas deterministas (sin IA); cached = inferencia real anterior. */
  mode: z.enum(["live", "fallback", "cached"]),
  created_at: EpochMs,
  latency_ms: z.number().int().nullable(),
});
export type AiOutputMeta = z.infer<typeof AiOutputMeta>;

export const FocusSpacesAction = z.object({
  type: z.literal("focus_spaces"),
  ids: z.array(z.string()).max(20),
});

export const ChatRequest = z.object({
  message: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(10)
    .default([]),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({
  answer: z.string(),
  citations: z.array(z.string()),
  actions: z.array(FocusSpacesAction),
  meta: AiOutputMeta,
});
export type ChatResponse = z.infer<typeof ChatResponse>;

/* ---------------------------------------------------------------- incidencias */

export const Incident = z.object({
  id: z.string(),
  space_id: z.string(),
  rule_id: z.string().nullable(),
  title: z.string(),
  status: IncidentStatus,
  severity: Severity,
  opened_at: EpochMs,
  closed_at: EpochMs.nullable(),
  diagnosis: AiDiagnosis.nullable(),
  diagnosis_meta: AiOutputMeta.nullable(),
});
export type Incident = z.infer<typeof Incident>;

export const IncidentEvent = z.object({
  id: z.string(),
  incident_id: z.string(),
  ts: EpochMs,
  kind: z.enum(["opened", "diagnosed", "notified", "acknowledged", "resolved", "comment"]),
  actor: z.string(),
  detail: z.string().nullable(),
});
export type IncidentEvent = z.infer<typeof IncidentEvent>;

export const IncidentsQuery = z.object({
  status: IncidentStatus.optional(),
  space_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const IncidentsResponse = z.object({ items: z.array(Incident) });
export const IncidentDetailResponse = z.object({
  incident: Incident,
  events: z.array(IncidentEvent),
});

export const IncidentPatch = z.object({
  status: z.enum(["acknowledged", "resolved"]),
  comment: z.string().max(500).optional(),
});
export type IncidentPatch = z.infer<typeof IncidentPatch>;

/* ---------------------------------------------------------------- reglas y bots */

export const AlertRule = z.object({
  id: z.string(),
  name: z.string(),
  /** occupancy_ratio = occupancy / capacity del espacio. */
  metric: z.union([Metric, z.literal("occupancy_ratio")]),
  op: z.enum([">", ">=", "<", "<="]),
  threshold: z.number(),
  sustain_s: z.number().int().min(0).max(3600),
  severity: Severity,
  enabled: z.boolean(),
});
export type AlertRule = z.infer<typeof AlertRule>;

export const BotRun = z.object({
  id: z.string(),
  bot: z.enum(["incident-bot", "report-bot", "ui-rpa-bot"]),
  started_at: EpochMs,
  finished_at: EpochMs.nullable(),
  status: z.enum(["running", "success", "partial", "failed"]),
  summary: z.string(),
});
export type BotRun = z.infer<typeof BotRun>;

export const ScenarioName = z.enum(["aula-saturada", "falla-climatizacion", "normalizar"]);
export type ScenarioName = z.infer<typeof ScenarioName>;

/* ---------------------------------------------------------------- sistema */

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({ db: z.boolean(), ai: z.enum(["available", "fallback", "unknown"]) }),
  time: EpochMs,
});

export const SystemInfo = z.object({
  name: z.literal("CampusPulse 360"),
  version: z.string(),
  commit: z.string(),
  environment: z.enum(["local", "preview", "production"]),
  ai: z.object({
    provider: AiProviderName,
    model: z.string(),
    calls_today: z.number().int(),
    daily_limit: z.number().int(),
    est_neurons_today: z.number(),
  }),
  telemetry_simulated: z.boolean(),
});
export type SystemInfo = z.infer<typeof SystemInfo>;

export const SessionInfo = z.object({
  authenticated: z.boolean(),
  role: Role,
  name: z.string().nullable(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;
