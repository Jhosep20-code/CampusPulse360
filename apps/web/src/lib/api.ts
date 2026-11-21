import { reportToHtml, type ReportContent } from "./reportHtml";
import {
  API_PREFIX,
  BotRun,
  CampusResponse,
  ChatResponse,
  ForecastResponse,
  HealthResponse,
  IncidentDetailResponse,
  IncidentsResponse,
  LiveSnapshot,
  Problem,
  ReadingsResponse,
  SessionInfo,
  SystemInfo,
  AlertRule,
  type ChatRequest,
  type IncidentPatch,
  type IncidentStatus,
  type Metric,
  type ScenarioName,
} from "@campuspulse/contracts";
import { z } from "zod";

/* ------------------------------------------------------------------ errores */

/** Error controlado de la API (problem+json, red o esquema). */
export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (detail !== undefined) this.detail = detail;
  }
}

/** La respuesta llego pero no cumple el contrato zod. */
export class SchemaError extends ApiError {
  constructor(path: string, detail: string) {
    super("La respuesta de la API no cumple el contrato", 502, `${path}: ${detail}`);
    this.name = "SchemaError";
  }
}

/* ------------------------------------------------------------------ esquemas locales */

/** Un array o `{ items: [...] }`; el cliente acepta ambas formas. */
function listOf<S extends z.ZodType>(item: S) {
  return z.union([z.array(item), z.object({ items: z.array(item) }).transform((o) => o.items)]);
}

/** Reportes del bot (forma definida por apps/api/src/engine/report-bot.ts). */
const reportTitle = (kind: string, created: number) =>
  `Reporte ${kind === "daily" ? "diario" : kind} · ${new Date(created).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}`;

export const ReportMeta = z
  .object({
    id: z.string(),
    kind: z.string().default("daily"),
    created_at: z.number(),
    period_start: z.number().nullable().optional(),
    period_end: z.number().nullable().optional(),
  })
  .transform((r) => ({ ...r, title: reportTitle(r.kind, r.created_at) }));
export type ReportMeta = z.output<typeof ReportMeta>;

export const ReportDetail = z
  .object({
    id: z.string(),
    kind: z.string().default("daily"),
    created_at: z.number(),
    content_json: z.record(z.string(), z.unknown()),
  })
  .transform((r) => {
    const title = reportTitle(r.kind, r.created_at);
    return { id: r.id, title, html: reportToHtml(r.content_json as ReportContent, title) };
  });
export type ReportDetail = z.output<typeof ReportDetail>;

/** Respuesta de /auth/passkey/{login,register}/options. */
const PasskeyOptions = z.object({ challenge_id: z.string(), options: z.record(z.string(), z.unknown()) });

/* ------------------------------------------------------------------ nucleo */

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string>;
}

async function toProblem(res: Response): Promise<ApiError> {
  let title = `Error ${res.status}`;
  let detail: string | undefined;
  try {
    const parsed = Problem.safeParse(await res.json());
    if (parsed.success) {
      title = parsed.data.title;
      detail = parsed.data.detail;
    }
  } catch {
    /* cuerpo no JSON */
  }
  return new ApiError(title, res.status, detail);
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  const init: RequestInit = {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers,
  };
  if (opts.signal) init.signal = opts.signal;
  const method = opts.method ?? "GET";
  // La API exige Content-Type JSON en toda peticion mutante (defensa CSRF).
  if (opts.json !== undefined || method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json ?? {});
  }
  try {
    return await fetch(`${API_PREFIX}${path}`, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("No se pudo conectar con la API", 0, e instanceof Error ? e.message : undefined);
  }
}

/** Peticion tipada: valida la respuesta con el esquema zod indicado. */
export async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: RequestOptions = {},
): Promise<z.output<S>> {
  const res = await send(path, opts);
  if (!res.ok) throw await toProblem(res);
  let body: unknown;
  try {
    body = res.status === 204 ? null : await res.json();
  } catch {
    throw new SchemaError(path, "el cuerpo no es JSON valido");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SchemaError(path, parsed.error.issues[0]?.message ?? "esquema invalido");
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ endpoints */

export type LiveResult =
  | { kind: "data"; data: LiveSnapshot; etag: string | null }
  | { kind: "not-modified" };

/** GET /live con If-None-Match; 304 = sin cambios. */
export async function getLive(etag: string | null, signal?: AbortSignal): Promise<LiveResult> {
  const res = await send("/live", {
    signal,
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (res.status === 304) return { kind: "not-modified" };
  if (!res.ok) throw await toProblem(res);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SchemaError("/live", "el cuerpo no es JSON valido");
  }
  const parsed = LiveSnapshot.safeParse(body);
  if (!parsed.success) throw new SchemaError("/live", parsed.error.issues[0]?.message ?? "esquema invalido");
  return { kind: "data", data: parsed.data, etag: res.headers.get("ETag") };
}

export const api = {
  campus: (signal?: AbortSignal) => request("/campus", CampusResponse, { signal }),
  readings: (spaceId: string, from: number, to: number, step = 300, signal?: AbortSignal) =>
    request(
      `/spaces/${encodeURIComponent(spaceId)}/readings?from=${from}&to=${to}&step=${step}`,
      ReadingsResponse,
      { signal },
    ),
  forecast: (spaceId: string, metric: Metric = "co2_ppm", signal?: AbortSignal) =>
    request(`/spaces/${encodeURIComponent(spaceId)}/forecast?metric=${metric}`, ForecastResponse, { signal }),

  incidents: (q: { status?: IncidentStatus | undefined; space_id?: string | undefined; limit?: number } = {}, signal?: AbortSignal) => {
    const p = new URLSearchParams();
    if (q.status) p.set("status", q.status);
    if (q.space_id) p.set("space_id", q.space_id);
    p.set("limit", String(q.limit ?? 50));
    return request(`/incidents?${p.toString()}`, IncidentsResponse, { signal });
  },
  incident: (id: string, signal?: AbortSignal) =>
    request(`/incidents/${encodeURIComponent(id)}`, IncidentDetailResponse, { signal }),
  patchIncident: (id: string, patch: IncidentPatch) =>
    request(`/incidents/${encodeURIComponent(id)}`, z.unknown(), { method: "PATCH", json: patch }),
  rediagnose: (id: string) =>
    request(`/incidents/${encodeURIComponent(id)}/diagnose`, z.unknown(), { method: "POST" }),

  chat: (body: Pick<ChatRequest, "message"> & { history: ChatRequest["history"] }) =>
    request("/ai/chat", ChatResponse, { method: "POST", json: body }),

  rules: (signal?: AbortSignal) => request("/rules", listOf(AlertRule), { signal }),
  setRuleEnabled: (id: string, enabled: boolean) =>
    request(`/rules/${encodeURIComponent(id)}`, z.unknown(), { method: "PATCH", json: { enabled } }),
  botRuns: (signal?: AbortSignal) => request("/bots/runs", listOf(BotRun), { signal }),
  reports: (signal?: AbortSignal) => request("/reports", listOf(ReportMeta), { signal }),
  report: (id: string, signal?: AbortSignal) =>
    request(`/reports/${encodeURIComponent(id)}`, ReportDetail, { signal }),
  scenario: (name: ScenarioName) =>
    request(`/scenarios/${encodeURIComponent(name)}`, z.unknown(), { method: "POST" }),

  health: (signal?: AbortSignal) => request("/system/health", HealthResponse, { signal }),
  system: (signal?: AbortSignal) => request("/system/info", SystemInfo, { signal }),

  session: (signal?: AbortSignal) => request("/auth/session", SessionInfo, { signal }),
  logout: () => request("/auth/logout", z.unknown(), { method: "POST" }),
  passkeyLoginOptions: () =>
    request("/auth/passkey/login/options", PasskeyOptions, { method: "POST", json: {} }),
  passkeyLoginVerify: (challenge_id: string, response: unknown) =>
    request("/auth/passkey/login/verify", z.unknown(), { method: "POST", json: { challenge_id, response } }),
  passkeyRegisterOptions: (body: { bootstrap_token: string; name: string; role: "admin" | "operator" }) =>
    request("/auth/passkey/register/options", PasskeyOptions, { method: "POST", json: body }),
  passkeyRegisterVerify: (challenge_id: string, response: unknown) =>
    request("/auth/passkey/register/verify", z.unknown(), { method: "POST", json: { challenge_id, response } }),
};
