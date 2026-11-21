import type { Env } from "../env";
import { buildRuleDiagnosis } from "../engine/rules-fallback";
import { ASSISTANT_TAG, RESULT_END, RESULT_START, ROUTER_TAG } from "./prompts/assistant.v1";
import { DIAGNOSE_TAG, type DiagnoseContext } from "./prompts/diagnose.v1";
import { REPORT_TAG, deterministicNarrative, type ReportData } from "./prompts/report.v1";
import { renderToolAnswer } from "./tools";
import type { AiCompleteOpts, AiCompletion, AiMessage, AiToolCall, AIProvider } from "./types";
import { estimateTokens, extractJsonObject } from "./util";

export type { AIProvider, AiCompletion, AiMessage } from "./types";

export const DEFAULT_WORKERS_AI_MODEL = "@cf/openai/gpt-oss-20b";
const REQUEST_TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------------ Workers AI */

type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

function parseArgs(v: unknown): Record<string, unknown> {
  if (isRec(v)) return v;
  if (typeof v === "string") {
    try {
      const p: unknown = JSON.parse(v);
      return isRec(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (isRec(p) && typeof p.text === "string" ? p.text : typeof p === "string" ? p : ""))
      .join("");
  }
  return "";
}

/**
 * Extrae texto, tool calls y uso de tokens de la respuesta de Workers AI.
 * Forma defensiva: admite Chat Completions (choices[0].message), Responses API
 * (output_text / output[] con items message y function_call) y el formato
 * legado { response: string }. Se ignora el razonamiento (reasoning_content).
 */
export function parseWorkersAiOutput(res: unknown): Pick<AiCompletion, "text" | "toolCalls" | "usage"> {
  let text = "";
  const toolCalls: AiToolCall[] = [];
  let usage: AiCompletion["usage"];
  if (!isRec(res)) return { text: typeof res === "string" ? res : "" };
  // Algunos entornos envuelven la salida en { result: ... }.
  const r: Rec = isRec(res.result) && !("choices" in res) && !("output" in res) ? res.result : res;

  const choices = r.choices;
  if (Array.isArray(choices) && isRec(choices[0]) && isRec(choices[0].message)) {
    const msg = choices[0].message;
    text = contentText(msg.content);
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (isRec(tc) && isRec(tc.function) && typeof tc.function.name === "string") {
          toolCalls.push({ name: tc.function.name, arguments: parseArgs(tc.function.arguments) });
        }
      }
    }
  }
  if (!text && typeof r.output_text === "string") text = r.output_text;
  if (Array.isArray(r.output)) {
    for (const item of r.output) {
      if (!isRec(item)) continue;
      if (item.type === "message" && !text) text = contentText(item.content);
      else if (item.type === "function_call" && typeof item.name === "string") {
        toolCalls.push({ name: item.name, arguments: parseArgs(item.arguments) });
      }
    }
  }
  if (!text && typeof r.response === "string") text = r.response;

  const u = r.usage;
  if (isRec(u)) {
    const i = Number(u.prompt_tokens ?? u.input_tokens);
    const o = Number(u.completion_tokens ?? u.output_tokens);
    if (Number.isFinite(i) && Number.isFinite(o)) usage = { input_tokens: i, output_tokens: o };
  }
  return { text: text.trim(), toolCalls: toolCalls.length ? toolCalls : undefined, usage };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout de inferencia")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export class WorkersAIProvider implements AIProvider {
  readonly name = "workers-ai" as const;
  readonly model: string;
  private readonly ai: AiBinding;

  constructor(ai: unknown, model: string = DEFAULT_WORKERS_AI_MODEL) {
    this.ai = ai as AiBinding;
    this.model = model;
  }

  /** Entrada estilo Chat Completions (messages). */
  private chatInput(messages: AiMessage[], opts: AiCompleteOpts): Rec {
    const body: Rec = { messages, max_tokens: opts.maxTokens, reasoning_effort: "low", temperature: 0.2 };
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    return body;
  }

  /** Entrada estilo Responses API (instructions + input). */
  private responsesInput(messages: AiMessage[], opts: AiCompleteOpts): Rec {
    const body: Rec = {
      instructions: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
      input: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: opts.maxTokens,
      reasoning: { effort: "low" },
      temperature: 0.2,
    };
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: null,
      }));
    }
    return body;
  }

  async complete(messages: AiMessage[], opts: AiCompleteOpts): Promise<AiCompletion> {
    const t0 = Date.now();
    let raw: unknown;
    try {
      raw = await withTimeout(this.ai.run(this.model, this.chatInput(messages, opts)), REQUEST_TIMEOUT_MS);
    } catch (e) {
      // Si el modelo rechaza la forma `messages`, se reintenta con la forma Responses API.
      const msg = e instanceof Error ? e.message : "";
      if (!/messages|input|schema|invalid|validation|unexpected/i.test(msg)) throw e;
      raw = await withTimeout(this.ai.run(this.model, this.responsesInput(messages, opts)), REQUEST_TIMEOUT_MS);
    }
    return { ...parseWorkersAiOutput(raw), latencyMs: Date.now() - t0 };
  }
}

/* ------------------------------------------------------------------ OpenAI (solo con clave aportada por el equipo) */

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model.startsWith("@cf/") ? "gpt-4o-mini" : model;
  }

  async complete(messages: AiMessage[], opts: AiCompleteOpts): Promise<AiCompletion> {
    const t0 = Date.now();
    const body: Rec = { model: this.model, messages, max_completion_tokens: opts.maxTokens, temperature: 0.2 };
    if (opts.json) body.response_format = { type: "json_object" };
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`openai http-${res.status}`);
    return { ...parseWorkersAiOutput(await res.json()), latencyMs: Date.now() - t0 };
  }
}

/* ------------------------------------------------------------------ Mock determinista (pruebas y CI) */

const SPACE_TOKEN = /\b(SPC_\d{1,2}_[A-Z0-9]{2,12}|A\d{3}|LAB\d|AUD|OFI|BIB|LOBBY)\b/i;

function metricFromText(q: string): string | undefined {
  if (/co2|aire|ventila/.test(q)) return "co2_ppm";
  if (/temperatura|calor|clima|calien|frio/.test(q)) return "temp_c";
  if (/humedad/.test(q)) return "rh_pct";
  if (/aforo|ocupaci|gente|personas|saturad|lleno/.test(q)) return "occupancy";
  if (/energ|consumo|potencia|electric/.test(q)) return "power_w";
  return undefined;
}

/** Elige una herramienta por palabras clave (determinista). */
export function mockRoute(question: string): AiToolCall {
  const q = question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const sp = SPACE_TOKEN.exec(question)?.[1];
  const metric = metricFromText(q);
  if (/pronostic|prevision|forecast|predic|proxim|tendencia/.test(q) && sp) {
    return { name: "get_space_forecast", arguments: { space_id: sp, metric: metric ?? "co2_ppm" } };
  }
  if (/incidencia|alerta|abiert/.test(q)) return { name: "get_open_incidents", arguments: {} };
  if (/riesgo|critic|peor|problema|saturad|alert|excedid|sobreaforo/.test(q)) {
    return { name: "list_spaces_at_risk", arguments: metric ? { metric } : {} };
  }
  if (sp && /estado|como esta|cuanto|que tal|datos|ocupa|temperatura|co2/.test(q)) {
    return { name: "get_space_status", arguments: { space_id: sp } };
  }
  if (/resumen|campus|general|panorama|todo/.test(q)) return { name: "get_campus_status", arguments: {} };
  if (/busca|encuentra|donde|ubica|piso|aula|laboratorio|biblioteca|auditorio|oficina/.test(q)) {
    return { name: "find_spaces", arguments: { query: question } };
  }
  if (sp) return { name: "get_space_status", arguments: { space_id: sp } };
  return { name: "get_campus_status", arguments: {} };
}

function lastUser(messages: AiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") return m.content;
  }
  return "";
}

export class MockProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model: string;

  constructor(model = "mock-model") {
    this.model = model;
  }

  async complete(messages: AiMessage[], opts: AiCompleteOpts): Promise<AiCompletion> {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    const last = lastUser(messages);
    let text = "";
    let toolCalls: AiToolCall[] | undefined;

    if (sys.includes(DIAGNOSE_TAG)) {
      const raw = extractJsonObject(last.slice(last.indexOf("CONTEXTO:")));
      const ctx = JSON.parse(raw ?? "{}") as DiagnoseContext;
      text = JSON.stringify(buildRuleDiagnosis(ctx, 0.7));
    } else if (sys.includes(REPORT_TAG)) {
      const data = JSON.parse(extractJsonObject(last.slice(last.indexOf("DATOS:"))) ?? "{}") as Partial<ReportData>;
      text = JSON.stringify(
        data.totals && data.spaces
          ? deterministicNarrative({ simulated: true, period: { start: 0, end: 0 }, totals: data.totals, spaces: data.spaces })
          : { narrativa: "Sin datos suficientes para el reporte (datos simulados).", recomendaciones: ["Verificar la ingesta de telemetría."] },
      );
    } else if (sys.includes(ROUTER_TAG)) {
      const c = mockRoute(last);
      text = JSON.stringify({ tool: c.name, args: c.arguments });
    } else if (sys.includes(ASSISTANT_TAG)) {
      if (opts.tools?.length) {
        toolCalls = [mockRoute(last)];
      } else {
        const m = new RegExp(`${RESULT_START} (\\w+)\\n([\\s\\S]*?)\\n${RESULT_END}`).exec(last);
        const result = m ? (JSON.parse(m[2] ?? "{}") as Record<string, unknown>) : {};
        text = JSON.stringify(renderToolAnswer(m?.[1] ?? "", result));
      }
    } else {
      text = "{}";
    }
    const inTok = messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    return { text, toolCalls, usage: { input_tokens: inTok, output_tokens: estimateTokens(text) }, latencyMs: 1 };
  }
}

/* ------------------------------------------------------------------ fabrica */

/** Devuelve el proveedor configurado o null (sin binding AI / sin clave): el llamador usa el fallback determinista. */
export function getProvider(env: Env): AIProvider | null {
  switch (env.AI_PROVIDER) {
    case "mock":
      return new MockProvider(env.AI_MODEL || "mock-model");
    case "workers-ai":
      return env.AI ? new WorkersAIProvider(env.AI, env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL) : null;
    case "openai":
      return env.OPENAI_API_KEY ? new OpenAIProvider(env.OPENAI_API_KEY, env.AI_MODEL) : null;
    default:
      return null;
  }
}
