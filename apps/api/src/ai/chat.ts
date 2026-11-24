import type { AiOutputMeta, ChatRequest, ChatResponse } from "@campuspulse/contracts";
import { z } from "zod";
import type { Env } from "../env";
import { newId } from "../lib/ids";
import {
  ASSISTANT_PROMPT_ID,
  ASSISTANT_PROMPT_VERSION,
  buildAnswerMessages,
  buildRouterMessages,
  buildToolSelectMessages,
} from "./prompts/assistant.v1";
import { getProvider } from "./provider";
import { recordAiUsage, reserveAiCall } from "./quota";
import { detectIntent, type Intent } from "./intent";
import { ASSISTANT_TOOLS, renderToolAnswer, runTool, type ToolExecution } from "./tools";
import type { AIProvider, AiCompletion, AiToolCall } from "./types";
import { estimateTokens, parseJsonLoose } from "./util";

const AnswerJson = z.object({
  answer: z.string().min(1).max(2000),
  citations: z.array(z.string()).default([]),
  focus_space_ids: z.array(z.string()).default([]),
});

function routeFromText(text: string): AiToolCall | null {
  const j = parseJsonLoose(text);
  if (!j.ok || !j.value || typeof j.value !== "object") return null;
  const o = j.value as Record<string, unknown>;
  const name = typeof o.tool === "string" ? o.tool : typeof o.name === "string" ? o.name : null;
  if (!name) return null;
  const a = o.args ?? o.arguments;
  return { name, arguments: a && typeof a === "object" ? (a as Record<string, unknown>) : {} };
}

/**
 * Datos que una respuesta de la IA DEBE conservar para considerarse fiel al calculo del backend:
 * el codigo del espacio principal y su cifra clave (porcentaje, ppm, °C, W o conteo).
 * Devuelve null cuando la herramienta no tiene un "dato ancla" verificable.
 */
export function answerAnchors(exec: ToolExecution): { code: string; name: string; number: string | null } | null {
  const r = exec.result as Record<string, unknown>;
  const row = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  const intPart = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : null);
  let top: Record<string, unknown> | null = null;
  let num: string | null = null;
  if (exec.name === "rank_spaces") {
    top = row(r.top);
    num = intPart(top?.value);
  } else if (exec.name === "list_spaces_by_condition") {
    const list = Array.isArray(r.spaces) ? r.spaces : [];
    top = row(list[0]) ?? (r.condition === "over_capacity" ? row(r.highest_ratio) : null);
    num = r.condition === "over_capacity" ? intPart(top?.occupancy_pct) : null;
  } else if (exec.name === "get_open_incidents") {
    const list = Array.isArray(r.incidents) ? r.incidents : [];
    top = row(list[0]);
    num = intPart(r.count);
  }
  if (!top || typeof top.code !== "string") return null;
  return { code: top.code, name: typeof top.name === "string" ? top.name : top.code, number: num };
}

const foldText = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** true si la respuesta redactada por la IA menciona el espacio y la cifra que calculo el backend. */
export function answerMatchesAnchors(answer: string, anchors: NonNullable<ReturnType<typeof answerAnchors>>): boolean {
  const a = foldText(answer);
  const hasSpace = new RegExp(`\\b${escRe(anchors.code.toLowerCase())}\\b`).test(a) || a.includes(foldText(anchors.name));
  if (!hasSpace) return false;
  if (!anchors.number) return true;
  // Quita separadores de miles ("1.700", "1 700") antes de buscar la cifra.
  const digits = a.replace(/(\d)[.\s ](?=\d{3}\b)/g, "$1");
  return new RegExp(`(^|[^\\d])${anchors.number}([^\\d]|$)`).test(digits);
}

function incidentIds(exec: ToolExecution | null): string[] {
  const list = exec?.result.incidents;
  return Array.isArray(list) ? list.map((i) => String((i as { id?: unknown }).id ?? "")).filter(Boolean) : [];
}

/**
 * Asistente conversacional con herramientas de SOLO LECTURA (nunca SQL libre).
 * Flujo: (0) si la pregunta es de una familia conocida (ranking, sobreaforo, CO2, incidencias...) el servidor
 * elige la herramienta de forma determinista (detectIntent) y no gasta la llamada de seleccion; si no, (1) el modelo
 * elige herramienta (tool calls nativas o enrutado por JSON); (2) el servidor la ejecuta; (3) el modelo redacta
 * {answer, citations, focus_space_ids} a partir del resultado y del resumen verificado. Si la redaccion omite el
 * espacio o la cifra que calculo el backend, se descarta y se responde con el resumen determinista.
 * Sin proveedor, sin cupo o ante cualquier fallo se responde de forma determinista (meta.mode "fallback").
 * `deps.provider` permite inyectar un proveedor en pruebas.
 */
export async function assistantChat(
  env: Env,
  req: ChatRequest,
  now: number,
  deps: { provider?: AIProvider | null } = {},
): Promise<ChatResponse> {
  const provider = deps.provider !== undefined ? deps.provider : getProvider(env);
  const history = req.history ?? [];
  let inTok = 0;
  let outTok = 0;
  let latency = 0;

  const track = async (c: AiCompletion, input: string) => {
    const i = c.usage?.input_tokens ?? estimateTokens(input);
    const o = c.usage?.output_tokens ?? estimateTokens(c.text);
    inTok += i;
    outTok += o;
    latency += c.latencyMs;
    await recordAiUsage(env, now, i, o);
  };

  const validSpaceIds = async (): Promise<Set<string>> => {
    const { results } = await env.DB.prepare("SELECT id FROM spaces").all<{ id: string }>();
    return new Set(results.map((r) => r.id));
  };

  const save = async (
    mode: "live" | "fallback",
    providerName: string,
    model: string,
    valid: boolean,
    payload: unknown,
  ) => {
    try {
      await env.DB.prepare(
        `INSERT INTO ai_outputs (id, incident_id, prompt_id, prompt_version, provider, model, mode, input_tokens, output_tokens, latency_ms, valid_json, output_json, created_at)
         VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      )
        .bind(
          newId("aio"), ASSISTANT_PROMPT_ID, ASSISTANT_PROMPT_VERSION, providerName, model, mode,
          mode === "live" ? inTok : null, mode === "live" ? outTok : null, mode === "live" ? Math.round(latency) : null,
          valid ? 1 : 0, JSON.stringify(payload).slice(0, 8000), now,
        )
        .run();
    } catch (e) {
      console.warn("chat: no se pudo guardar ai_output", e instanceof Error ? e.message : "error");
    }
  };

  const intent: Intent | null = detectIntent(req.message);

  /** Respuesta determinista (sin IA) a partir de un resultado de herramienta o, por defecto, la del intent (o el estado del campus). */
  const fallback = async (reason: string, exec: ToolExecution | null, liveAttempt?: { valid: boolean }): Promise<ChatResponse> => {
    const e = exec ?? (await runTool(env, intent?.call.name ?? "get_campus_status", intent?.call.arguments ?? {}, now));
    const r = renderToolAnswer(e.name, e.result);
    const valid = await validSpaceIds();
    const ids = [...new Set(r.focus_space_ids)].filter((id) => valid.has(id));
    const meta: AiOutputMeta = { provider: "rules-fallback", model: "rules-v1", mode: "fallback", created_at: now, latency_ms: null };
    const answer = `${reason} ${r.answer}`;
    await save("fallback", "rules-fallback", "rules-v1", liveAttempt ? liveAttempt.valid : true, { tool: e.name, args: e.args, answer, citations: ids });
    return {
      answer,
      citations: r.citations.filter((id) => valid.has(id)),
      actions: ids.length ? [{ type: "focus_spaces", ids: ids.slice(0, 20) }] : [],
      meta,
    };
  };

  if (!provider || !(await reserveAiCall(env, now))) {
    return fallback(
      intent
        ? "El asistente de IA no está disponible ahora (sin proveedor o cupo diario agotado); respondo con el cálculo determinista del servidor."
        : "El asistente de IA no está disponible ahora (sin proveedor o cupo diario agotado) y no reconocí el tipo de pregunta; muestro el estado general del campus.",
      null,
    );
  }

  // Etapa 1: eleccion de herramienta. Determinista si la pregunta es de una familia conocida; si no, la decide el modelo.
  let call: AiToolCall | null = intent?.call ?? null;
  if (!call) try {
    const msgs = buildToolSelectMessages(req.message, history);
    const c1 = await provider.complete(msgs, { maxTokens: 500, tools: ASSISTANT_TOOLS });
    await track(c1, msgs.map((m) => m.content).join("\n"));
    call = c1.toolCalls?.[0] ?? routeFromText(c1.text);
  } catch (e) {
    console.warn("chat: etapa 1 fallida", e instanceof Error ? e.message : "error");
  }
  if (!call && (await reserveAiCall(env, now))) {
    try {
      const msgs = buildRouterMessages(req.message, history);
      const c = await provider.complete(msgs, { maxTokens: 400, json: true });
      await track(c, msgs.map((m) => m.content).join("\n"));
      call = routeFromText(c.text);
    } catch (e) {
      console.warn("chat: enrutado JSON fallido", e instanceof Error ? e.message : "error");
    }
  }
  if (!call) return fallback("No pude interpretar la consulta con IA; muestro el estado general del campus con reglas deterministas.", null);

  const exec = await runTool(env, call.name, call.arguments, now);

  // Etapa 2: redaccion de la respuesta. Con intent determinista la reserva inicial ya cubre esta unica llamada.
  if (!intent && !(await reserveAiCall(env, now))) {
    return fallback("Cupo diario de IA agotado; resumo el resultado con reglas deterministas.", exec);
  }
  let c2: AiCompletion;
  try {
    const msgs = buildAnswerMessages(req.message, history, exec.name, exec.result, renderToolAnswer(exec.name, exec.result).answer);
    c2 = await provider.complete(msgs, { maxTokens: 800, json: true });
    await track(c2, msgs.map((m) => m.content).join("\n"));
  } catch (e) {
    console.warn("chat: etapa 2 fallida", e instanceof Error ? e.message : "error");
    return fallback("La IA no respondió (error del proveedor o tiempo agotado); resumo el resultado con reglas deterministas.", exec);
  }
  const j = parseJsonLoose(c2.text);
  const parsed = j.ok ? AnswerJson.safeParse(j.value) : null;
  if (!parsed?.success) {
    return fallback("La IA devolvió una respuesta inválida; resumo el resultado con reglas deterministas.", exec, { valid: false });
  }

  // Fidelidad: la IA explica, pero no puede cambiar el espacio ni la cifra que calculo el backend.
  const anchors = answerAnchors(exec);
  if (anchors && !answerMatchesAnchors(parsed.data.answer, anchors)) {
    await save("live", provider.name, provider.model, false, { tool: exec.name, rejected: "omite o contradice el dato calculado", expected: anchors, answer: parsed.data.answer });
    return fallback("La redacción de la IA no coincidía con el cálculo del servidor; respondo con el resultado verificado.", exec, { valid: true });
  }
  const answer = /simulad/i.test(parsed.data.answer) ? parsed.data.answer : `${parsed.data.answer} (Datos simulados.)`;

  const valid = await validSpaceIds();
  const okIds = new Set([...valid, ...incidentIds(exec)]);
  const citations = [...new Set(parsed.data.citations)].filter((id) => okIds.has(id));
  // Con pregunta conocida, el foco del gemelo 3D lo decide el calculo del servidor (p. ej. solo el primero del ranking).
  let focus = (intent ? renderToolAnswer(exec.name, exec.result).focus_space_ids : [...new Set(parsed.data.focus_space_ids)]).filter((id) => valid.has(id));
  if (focus.length === 0 && !intent) focus = citations.filter((id) => valid.has(id));
  focus = focus.slice(0, 20);
  await save("live", provider.name, provider.model, true, { tool: exec.name, args: exec.args, intent: intent?.id ?? null, answer, citations });
  return {
    answer,
    citations,
    actions: focus.length ? [{ type: "focus_spaces", ids: focus }] : [],
    meta: { provider: provider.name, model: provider.model, mode: "live", created_at: now, latency_ms: Math.round(latency) },
  };
}
