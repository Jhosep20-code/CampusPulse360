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

function incidentIds(exec: ToolExecution | null): string[] {
  const list = exec?.result.incidents;
  return Array.isArray(list) ? list.map((i) => String((i as { id?: unknown }).id ?? "")).filter(Boolean) : [];
}

/**
 * Asistente conversacional con 6 herramientas de SOLO LECTURA (nunca SQL libre).
 * Flujo: (1) el modelo elige herramienta (tool calls nativas o, si no las soporta,
 * enrutado por JSON); (2) el servidor la ejecuta; (3) el modelo redacta
 * {answer, citations, focus_space_ids}. Sin proveedor, sin cupo o ante cualquier
 * fallo se responde de forma determinista (meta.mode "fallback").
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

  /** Respuesta determinista (sin IA) a partir de un resultado de herramienta o, por defecto, list_spaces_at_risk. */
  const fallback = async (reason: string, exec: ToolExecution | null, liveAttempt?: { valid: boolean }): Promise<ChatResponse> => {
    const e = exec ?? (await runTool(env, "list_spaces_at_risk", {}, now));
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
      "El asistente de IA no está disponible ahora (sin proveedor configurado o cupo diario agotado), así que respondo con reglas deterministas sobre los espacios en riesgo.",
      null,
    );
  }

  // Etapa 1: eleccion de herramienta (tool calls nativas; si no, enrutado por JSON).
  let call: AiToolCall | null = null;
  try {
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
  if (!call) return fallback("No pude interpretar la consulta con IA; respondo con reglas deterministas.", null);

  const exec = await runTool(env, call.name, call.arguments, now);

  // Etapa 2: redaccion de la respuesta.
  if (!(await reserveAiCall(env, now))) {
    return fallback("Cupo diario de IA agotado; resumo el resultado con reglas deterministas.", exec);
  }
  let c2: AiCompletion;
  try {
    const msgs = buildAnswerMessages(req.message, history, exec.name, exec.result);
    c2 = await provider.complete(msgs, { maxTokens: 800, json: true });
    await track(c2, msgs.map((m) => m.content).join("\n"));
  } catch (e) {
    console.warn("chat: etapa 2 fallida", e instanceof Error ? e.message : "error");
    return fallback("La IA no respondió a tiempo; resumo el resultado con reglas deterministas.", exec);
  }
  const j = parseJsonLoose(c2.text);
  const parsed = j.ok ? AnswerJson.safeParse(j.value) : null;
  if (!parsed?.success) {
    return fallback("La IA devolvió una respuesta inválida; resumo el resultado con reglas deterministas.", exec, { valid: false });
  }

  const valid = await validSpaceIds();
  const okIds = new Set([...valid, ...incidentIds(exec)]);
  const citations = [...new Set(parsed.data.citations)].filter((id) => okIds.has(id));
  let focus = [...new Set(parsed.data.focus_space_ids)].filter((id) => valid.has(id));
  if (focus.length === 0) focus = citations.filter((id) => valid.has(id));
  focus = focus.slice(0, 20);
  await save("live", provider.name, provider.model, true, { tool: exec.name, args: exec.args, answer: parsed.data.answer, citations });
  return {
    answer: parsed.data.answer,
    citations,
    actions: focus.length ? [{ type: "focus_spaces", ids: focus }] : [],
    meta: { provider: provider.name, model: provider.model, mode: "live", created_at: now, latency_ms: Math.round(latency) },
  };
}
