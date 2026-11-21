import { z } from "zod";
import type { AiMessage } from "../types";
import { parseJsonLoose, round } from "../util";

export const REPORT_PROMPT_ID = "report";
export const REPORT_PROMPT_VERSION = "1.0.0";
export const REPORT_TAG = "[prompt:report@1.0.0]";

export interface ReportSpaceRow {
  space_id: string;
  name: string;
  level: number;
  capacity: number;
  readings_n: number;
  co2_avg: number | null;
  co2_max: number | null;
  temp_avg: number | null;
  occupancy_max: number | null;
  occupancy_ratio_max: number | null;
  incidents: number;
  incidents_critical: number;
}

export interface ReportTotals {
  spaces: number;
  readings: number;
  incidents: number;
  incidents_critical: number;
  co2_avg: number | null;
  co2_max: number | null;
  co2_max_space: string | null;
  temp_avg: number | null;
}

export interface ReportData {
  simulated: true;
  period: { start: number; end: number };
  spaces: ReportSpaceRow[];
  totals: ReportTotals;
}

const SYSTEM = `${REPORT_TAG}
Eres analista de operaciones de un campus universitario. Redactas un resumen ejecutivo del día a partir de los datos del bloque DATOS.
Reglas: usa SOLO esos datos, no inventes cifras; los datos son SIMULADOS (prototipo académico) y debes indicarlo; español; máximo 120 palabras.
Responde SOLO con JSON: {"narrativa": string, "recomendaciones": [string, ...] (de 1 a 3)}`;

export function buildReportMessages(data: ReportData): AiMessage[] {
  // Se envia una version compacta: sin ids de periodo y con una linea por espacio.
  const compact = {
    totales: data.totals,
    espacios: data.spaces.map((s) => ({
      id: s.space_id,
      nombre: s.name,
      co2_prom: s.co2_avg,
      co2_max: s.co2_max,
      temp_prom: s.temp_avg,
      ocup_max_ratio: s.occupancy_ratio_max,
      incidencias: s.incidents,
    })),
  };
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `DATOS:\n${JSON.stringify(compact)}` },
  ];
}

const Narrative = z.object({
  narrativa: z.string().min(10).max(1500),
  recomendaciones: z.array(z.string().min(2).max(300)).min(1).max(4),
});
export type ReportNarrative = z.infer<typeof Narrative>;

export function parseReportNarrative(text: string): { ok: true; value: ReportNarrative } | { ok: false; error: string } {
  const j = parseJsonLoose(text);
  if (!j.ok) return j;
  const r = Narrative.safeParse(j.value);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: "el JSON del reporte no cumple el esquema" };
}

/** Narrativa determinista (sin IA), etiquetada como tal por el llamador. */
export function deterministicNarrative(data: ReportData): ReportNarrative {
  const t = data.totals;
  const parts = [
    `Resumen de las últimas 24 h (datos simulados): ${t.spaces} espacios monitoreados y ${t.readings} lecturas procesadas.`,
    t.co2_avg !== null ? `CO2 promedio ${round(t.co2_avg, 0)} ppm` + (t.co2_max !== null ? `, con un máximo de ${round(t.co2_max, 0)} ppm${t.co2_max_space ? ` en ${t.co2_max_space}` : ""}.` : ".") : "No hay datos de CO2 en el periodo.",
    t.temp_avg !== null ? `Temperatura media ${round(t.temp_avg, 1)} C.` : "",
    `Incidencias del periodo: ${t.incidents} (${t.incidents_critical} críticas).`,
  ].filter(Boolean);
  const recs: string[] = [];
  const worst = [...data.spaces].filter((s) => s.incidents > 0).sort((a, b) => b.incidents - a.incidents)[0];
  if (worst) recs.push(`Revisar ${worst.name}: concentra ${worst.incidents} incidencia(s) en el periodo.`);
  if ((t.co2_max ?? 0) >= 1500) recs.push("Reforzar la ventilación en los espacios con picos de CO2 superiores a 1500 ppm.");
  if (recs.length === 0) recs.push("Sin acciones urgentes: mantener el monitoreo habitual.");
  return { narrativa: parts.join(" "), recomendaciones: recs };
}
