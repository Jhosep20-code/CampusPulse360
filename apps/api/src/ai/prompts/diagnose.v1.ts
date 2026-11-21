import { AiDiagnosis, type Metric, type Severity } from "@campuspulse/contracts";
import type { AiMessage } from "../types";
import { parseJsonLoose } from "../util";

export const DIAGNOSE_PROMPT_ID = "diagnose";
export const DIAGNOSE_PROMPT_VERSION = "1.0.0";
/** Marcador interno usado por el proveedor mock para reconocer el prompt. */
export const DIAGNOSE_TAG = "[prompt:diagnose@1.0.0]";

export interface MetricSummary {
  min: number;
  max: number;
  last: number;
}

/** Contexto resumido que se entrega al modelo (y a rules-fallback). */
export interface DiagnoseContext {
  simulated: true;
  now_lima: string;
  incident: { id: string; title: string; severity: Severity; opened_at: number };
  space: { id: string; name: string; type: string; level: number; capacity: number };
  rule: {
    id: string;
    name: string;
    metric: string;
    op: string;
    threshold: number;
    sustain_s: number;
    severity: Severity;
  } | null;
  device_id: string | null;
  readings: { n: number; window_min: number; summary: Partial<Record<Metric, MetricSummary>> };
  history: Array<{ opened_at: number; rule_id: string | null; severity: Severity; status: string }>;
}

const SYSTEM = `${DIAGNOSE_TAG}
Eres un operador de gestión de instalaciones (facility management) de un campus universitario. Analizas una incidencia detectada por reglas sobre telemetría de sensores y propones un diagnóstico operativo breve.

REGLAS ESTRICTAS
1. Usa SOLO los datos del bloque CONTEXTO. Si falta un dato, dilo en causa_probable (por ejemplo "no hay lecturas de ..."). No inventes valores, equipos ni causas no respaldadas por los datos.
2. Los datos son SIMULADOS (prototipo académico), no mediciones reales. No afirmes lo contrario.
3. Responde SOLO con un objeto JSON, sin texto adicional ni bloques de código, con exactamente estas claves:
{"causa_probable": string, "severidad": "info"|"warning"|"critical", "acciones": [string, ...], "evidencia": [{"device_id": string, "metric": "co2_ppm"|"temp_c"|"rh_pct"|"occupancy"|"power_w", "valor": number}], "confianza": number}
4. acciones: de 1 a 4 pasos concretos y ordenados que pueda ejecutar el personal de mantenimiento o de docencia.
5. evidencia: valores numéricos copiados del contexto (último, máximo o mínimo), con el device_id del contexto.
6. confianza entre 0 y 1; usa valores bajos si hay pocas lecturas o el contexto es ambiguo.
7. Escribe en español.`;

const EX1_CTX: DiagnoseContext = {
  simulated: true,
  now_lima: "2026-03-10 10:20 (martes, hora de Lima UTC-5)",
  incident: { id: "inc_ejemplo1", title: "CO2 critico en Aula X1", severity: "critical", opened_at: 1773156000000 },
  space: { id: "SPC_9_X1", name: "Aula X1", type: "classroom", level: 9, capacity: 40 },
  rule: { id: "RULE_CO2_CRIT", name: "CO2 critico", metric: "co2_ppm", op: ">=", threshold: 1500, sustain_s: 60, severity: "critical" },
  device_id: "DEV_9_X1",
  readings: {
    n: 30,
    window_min: 30,
    summary: {
      co2_ppm: { min: 640, max: 1720, last: 1720 },
      occupancy: { min: 0, max: 44, last: 44 },
      temp_c: { min: 22.1, max: 25.3, last: 25.3 },
    },
  },
  history: [],
};
const EX1_OUT = {
  causa_probable:
    "CO2 en aumento sostenido hasta 1720 ppm con 44 personas en un aula de capacidad 40: aforo excedido y ventilación insuficiente.",
  severidad: "critical",
  acciones: [
    "Ventilar de inmediato (abrir puertas y ventanas) y suspender el uso de ventilación recirculada.",
    "Reducir la ocupación por debajo del aforo de 40 personas.",
    "Revisar que la ventilación mecánica del aula esté operativa.",
  ],
  evidencia: [
    { device_id: "DEV_9_X1", metric: "co2_ppm", valor: 1720 },
    { device_id: "DEV_9_X1", metric: "occupancy", valor: 44 },
  ],
  confianza: 0.85,
};

const EX2_CTX: DiagnoseContext = {
  simulated: true,
  now_lima: "2026-03-10 15:05 (martes, hora de Lima UTC-5)",
  incident: {
    id: "inc_ejemplo2",
    title: "Temperatura alta sostenida en Laboratorio Y1",
    severity: "warning",
    opened_at: 1773173100000,
  },
  space: { id: "SPC_9_Y1", name: "Laboratorio Y1", type: "lab", level: 9, capacity: 25 },
  rule: {
    id: "RULE_TEMP_HIGH",
    name: "Temperatura alta sostenida",
    metric: "temp_c",
    op: ">=",
    threshold: 28,
    sustain_s: 180,
    severity: "warning",
  },
  device_id: "DEV_9_Y1",
  readings: {
    n: 30,
    window_min: 30,
    summary: {
      temp_c: { min: 23.4, max: 30.9, last: 30.9 },
      occupancy: { min: 12, max: 14, last: 13 },
      co2_ppm: { min: 610, max: 790, last: 760 },
    },
  },
  history: [],
};
const EX2_OUT = {
  causa_probable:
    "La temperatura subió de 23,4 a 30,9 C con ocupación estable (13 personas) y CO2 normal (760 ppm): se descarta aforo o ventilación y apunta a falla de climatización.",
  severidad: "warning",
  acciones: [
    "Verificar el funcionamiento y el termostato del equipo de climatización del laboratorio.",
    "Enviar a mantenimiento a revisar el equipo si la temperatura no baja en 30 minutos.",
  ],
  evidencia: [
    { device_id: "DEV_9_Y1", metric: "temp_c", valor: 30.9 },
    { device_id: "DEV_9_Y1", metric: "co2_ppm", valor: 760 },
  ],
  confianza: 0.7,
};

export function contextMessage(ctx: unknown): string {
  return `CONTEXTO:\n${JSON.stringify(ctx)}`;
}

export function buildDiagnoseMessages(ctx: DiagnoseContext): AiMessage[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: contextMessage(EX1_CTX) },
    { role: "assistant", content: JSON.stringify(EX1_OUT) },
    { role: "user", content: contextMessage(EX2_CTX) },
    { role: "assistant", content: JSON.stringify(EX2_OUT) },
    { role: "user", content: contextMessage(ctx) },
  ];
}

export type ParsedDiagnosis = { ok: true; value: AiDiagnosis } | { ok: false; error: string };

const SEV_ALIAS: Record<string, Severity> = {
  info: "info",
  informativa: "info",
  baja: "info",
  warning: "warning",
  advertencia: "warning",
  media: "warning",
  alta: "warning",
  critical: "critical",
  critica: "critical",
  critico: "critical",
};

function normalize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.severidad === "string") {
    const k = o.severidad.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    o.severidad = SEV_ALIAS[k] ?? o.severidad;
  }
  if (Array.isArray(o.evidencia)) {
    o.evidencia = o.evidencia.map((e) => {
      if (!e || typeof e !== "object") return e;
      const ev = { ...(e as Record<string, unknown>) };
      if (typeof ev.metric === "string") ev.metric = ev.metric.trim().toLowerCase();
      if (typeof ev.valor === "string" && ev.valor.trim() !== "" && Number.isFinite(Number(ev.valor))) {
        ev.valor = Number(ev.valor);
      }
      return ev;
    });
  }
  return o;
}

/** Extrae el primer objeto JSON de la respuesta del modelo y lo valida con AiDiagnosis. */
export function parseDiagnosis(text: string): ParsedDiagnosis {
  const j = parseJsonLoose(text);
  if (!j.ok) return j;
  const r = AiDiagnosis.safeParse(normalize(j.value));
  if (!r.success) {
    const msg = r.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `el JSON no cumple el esquema: ${msg}` };
  }
  return { ok: true, value: r.data };
}

export function retryMessage(error: string): string {
  return `Tu respuesta anterior no fue válida: ${error}. Responde de nuevo SOLO con el objeto JSON válido con las claves indicadas, sin texto adicional.`;
}
