import type { ChatRequest } from "@campuspulse/contracts";
import { ASSISTANT_TOOLS, type ToolResult } from "../tools";
import type { AiMessage } from "../types";

export const ASSISTANT_PROMPT_ID = "assistant";
export const ASSISTANT_PROMPT_VERSION = "1.1.0";
export const ASSISTANT_TAG = "[prompt:assistant@1.1.0]";
export const ROUTER_TAG = "[prompt:assistant-router@1.1.0]";
export const RESULT_START = "RESULTADO_HERRAMIENTA";
export const RESULT_END = "FIN_RESULTADO";
export const VERIFIED_START = "RESUMEN_VERIFICADO";

const BASE = `Eres el asistente de CampusPulse 360, el gemelo digital de la UTP Huancayo (edificio de 10 pisos; 10 espacios instrumentados en los pisos 1 a 5: hall, biblioteca, aulas, laboratorios, auditorio y oficinas).
Definiciones (no las confundas):
- Ocupación porcentual o "respecto a su aforo" = personas ÷ aforo × 100. "El más ocupado" significa el mayor porcentaje, aunque ninguno supere el 100 %.
- Ocupación absoluta = número de personas.
- Sobreaforo = más del 100 % del aforo. Espacio vacío = 0 personas. Sin conexión = sin lecturas en los últimos 3 min.
- "En riesgo" = estado de advertencia o crítico; NO es lo mismo que "el más ocupado".
Reglas:
- Los datos del campus son SIMULADOS (prototipo académico). Menciónalo cuando des cifras.
- Responde solo con información obtenida de las herramientas de lectura. Si la herramienta no devuelve el dato, dilo; no inventes valores ni espacios.
- Los cálculos (rankings, porcentajes, estados) ya los hizo el servidor: no recalcules ni cambies cifras, nombres o códigos.
- Eres de solo lectura: no puedes cambiar nada en el sistema.
- Responde en español, breve y claro (máximo 120 palabras). Estados en español: normal, advertencia, crítico, sin conexión. Decimales con coma (88,9 %).
- No menciones herramientas, JSON ni detalles internos del sistema.`;

const SELECT_SYSTEM = `${ASSISTANT_TAG}
${BASE}
Para responder, llama a UNA herramienta adecuada a la pregunta del usuario.`;

const ANSWER_SYSTEM = `${ASSISTANT_TAG}
${BASE}
Se te entrega el resultado de una herramienta. Redacta la respuesta final SOLO con un objeto JSON, sin texto adicional ni bloques de código:
{"answer": string, "citations": [ids de espacio (SPC_...) mencionados], "focus_space_ids": [ids de espacio a resaltar en el gemelo 3D]}
Usa únicamente ids que aparezcan en el resultado.
Si recibes un ${VERIFIED_START}, es la respuesta correcta calculada por el servidor: tu respuesta debe mantener el mismo espacio (nombre y código), las mismas cifras y porcentajes; puedes explicarla mejor, no contradecirla.`;

function routerSystem(): string {
  const catalog = ASSISTANT_TOOLS.map((t) => `- ${t.name}: ${t.description} Parámetros: ${JSON.stringify(t.parameters.properties)}`).join("\n");
  return `${ROUTER_TAG}
${BASE}
Elige UNA herramienta para responder la pregunta. Herramientas disponibles:
${catalog}
Responde SOLO con un objeto JSON, sin texto adicional: {"tool": "<nombre>", "args": {...}}`;
}

function historyMessages(history: ChatRequest["history"]): AiMessage[] {
  return history.slice(-6).map((h) => ({ role: h.role, content: h.content.slice(0, 500) }));
}

export function buildToolSelectMessages(question: string, history: ChatRequest["history"]): AiMessage[] {
  return [{ role: "system", content: SELECT_SYSTEM }, ...historyMessages(history), { role: "user", content: question }];
}

export function buildRouterMessages(question: string, history: ChatRequest["history"]): AiMessage[] {
  return [{ role: "system", content: routerSystem() }, ...historyMessages(history), { role: "user", content: question }];
}

export function buildAnswerMessages(
  question: string,
  history: ChatRequest["history"],
  toolName: string,
  result: ToolResult,
  verified?: string,
): AiMessage[] {
  const json = JSON.stringify(result).slice(0, 3500);
  const summary = verified ? `\n\n${VERIFIED_START}\n${verified.slice(0, 1200)}` : "";
  return [
    { role: "system", content: ANSWER_SYSTEM },
    ...historyMessages(history),
    {
      role: "user",
      content: `PREGUNTA: ${question}\n\n${RESULT_START} ${toolName}\n${json}\n${RESULT_END}${summary}\n\nResponde SOLO con el JSON indicado.`,
    },
  ];
}
