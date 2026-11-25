import type { AiToolCall } from "./types";

/*
 * Enrutado DETERMINISTA de las preguntas frecuentes del asistente a una herramienta de lectura.
 * Motivo: la eleccion de herramienta por el modelo confundia "el espacio mas ocupado respecto a su aforo"
 * (ranking por porcentaje) con "espacios en riesgo" (solo advertencia/critico) y respondia "no hay".
 * Los calculos (rankings, porcentajes, estados) los hace el backend; la IA solo redacta la explicacion.
 * Devuelve null si la pregunta no es clara: entonces elige el modelo (o el respaldo por reglas).
 */

export interface Intent {
  /** Identificador de la familia de pregunta (para pruebas y registro). */
  id:
    | "occupancy_ratio_top"
    | "occupancy_ratio_bottom"
    | "occupancy_absolute_top"
    | "over_capacity"
    | "empty"
    | "offline"
    | "co2_top"
    | "co2_bottom"
    | "temp_top"
    | "temp_bottom"
    | "power"
    | "incidents"
    | "bot"
    | "ai_diagnoses"
    | "campus"
    | "at_risk"
    | "forecast"
    | "space";
  call: AiToolCall;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const SPACE_TOKEN = /\b(SPC_\d{1,2}_[A-Z0-9]{2,12}|A\d{3}|LAB\d|AUD|OFI|BIB|LOBBY|0\d{3}|10\d{2})\b/i;

const MORE = /\b(mas|mayor|maxim[oa]s?|top|primer[oa]?|peor|alt[oa]s?|elevad[oa]s?)\b/;
const LESS = /\b(menos|menor|minim[oa]s?|baj[oa]s?)\b/;

export function detectIntent(question: string): Intent | null {
  const q = fold(question);
  const rank = (metric: string, order: "desc" | "asc", id: Intent["id"]): Intent => ({ id, call: { name: "rank_spaces", arguments: { metric, order, limit: 5 } } });
  const cond = (condition: string, id: Intent["id"]): Intent => ({ id, call: { name: "list_spaces_by_condition", arguments: { condition } } });

  // Automatizacion y diagnosticos (antes que "incidencia", que tambien aparece en esas preguntas).
  if (/\b(bot|bots|rpa|automatiz\w*|cron|acciones? automatic\w*)\b/.test(q)) return { id: "bot", call: { name: "get_bot_activity", arguments: {} } };
  if (/diagnostic\w*/.test(q) || /\b(ia|inteligencia artificial)\b.*\b(genero|generad\w*|dijo|propuso|explic\w*)\b/.test(q)) {
    return { id: "ai_diagnoses", call: { name: "get_ai_diagnoses", arguments: {} } };
  }
  if (/\b(incidencias?|incidentes?|alertas?)\b/.test(q) || /\b(gravedad|severidad)\b/.test(q)) return { id: "incidents", call: { name: "get_open_incidents", arguments: {} } };

  // Pronostico de un espacio concreto.
  const spToken = SPACE_TOKEN.exec(question)?.[1];
  if (spToken && /\b(pronostic\w*|prevision\w*|predic\w*|proxim\w*|tendencia|dentro de|estimad\w*)\b/.test(q)) {
    const metric = /\b(temperatura|calor)\b/.test(q) ? "temp_c" : /\b(ocupacion|aforo|personas|gente)\b/.test(q) ? "occupancy" : /\b(consumo|energia|potencia)\b/.test(q) ? "power_w" : "co2_ppm";
    return { id: "forecast", call: { name: "get_space_forecast", arguments: { space_id: spToken, metric } } };
  }
  // "En riesgo" = advertencia o critico (distinto de "el mas ocupado").
  if (/\b(riesgo|peligro|problemas?|anomal\w*|critic[oa]s?|en advertencia)\b/.test(q) && !/\b(mas|menos) (ocupad|llen)/.test(q)) {
    return { id: "at_risk", call: { name: "list_spaces_at_risk", arguments: {} } };
  }

  // Condiciones (no son rankings).
  if (/sobre\s?aforo|sobrecupo|exced\w*|supera\w*|por encima de(l| su) (aforo|capacidad)|mas (personas|gente) que (su )?(aforo|capacidad)/.test(q)) return cond("over_capacity", "over_capacity");
  if (/\b(desconectad\w*|offline|sin conexion|no reporta\w*|sin datos|caid[oa]s?|fuera de linea)\b/.test(q)) return cond("offline", "offline");
  if (/\b(vaci[oa]s?|desocupad\w*|sin (gente|personas|nadie)|ocupacion (cero|0|nula))\b/.test(q)) return cond("empty", "empty");

  // Rankings por metrica.
  if (/\b(consumo|energia|electric\w*|potencia|kw|kilowatt\w*|watts?)\b/.test(q)) return rank("power_w", LESS.test(q) && !MORE.test(q) ? "asc" : "desc", "power");
  if (/\b(co2|co 2|dioxido|calidad del aire|ventilacion)\b/.test(q)) {
    return LESS.test(q) && !MORE.test(q) ? rank("co2_ppm", "asc", "co2_bottom") : rank("co2_ppm", "desc", "co2_top");
  }
  if (/\b(temperatura|calor|caluros\w*|caliente|frio|fresc\w*)\b/.test(q)) {
    const cold = /\b(frio|fresc\w*)\b/.test(q) || (LESS.test(q) && !MORE.test(q));
    return cold ? rank("temp_c", "asc", "temp_bottom") : rank("temp_c", "desc", "temp_top");
  }
  const occWord = /\b(ocupad\w*|ocupacion|llen[oa]s?|concurrid\w*|aforo|capacidad|gente|personas|asistentes)\b/.test(q);
  if (occWord) {
    const absolute = /\b(personas|gente|asistentes|cantidad|numero)\b/.test(q) && !/\b(aforo|capacidad|porcentaje|%|relativ\w*|proporci\w*)\b/.test(q);
    if (LESS.test(q) && !MORE.test(q)) return rank("occupancy_ratio", "asc", "occupancy_ratio_bottom");
    if (MORE.test(q) || /\b(llen[oa]s?|concurrid\w*)\b/.test(q)) {
      return absolute ? rank("occupancy", "desc", "occupancy_absolute_top") : rank("occupancy_ratio", "desc", "occupancy_ratio_top");
    }
  }

  // Un espacio concreto.
  const sp = SPACE_TOKEN.exec(question)?.[1];
  if (sp) return { id: "space", call: { name: "get_space_status", arguments: { space_id: sp } } };

  if (/\b(estado general|resumen|panorama|situacion general|como esta el campus|estado del campus|como va el campus|kpis?)\b/.test(q)) {
    return { id: "campus", call: { name: "get_campus_status", arguments: {} } };
  }
  return null;
}
