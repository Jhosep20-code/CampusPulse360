import type { AiDiagnosis, AiOutputMeta, Metric } from "@campuspulse/contracts";
import type { DiagnoseContext } from "../ai/prompts/diagnose.v1";
import { round } from "../ai/util";

export const FALLBACK_PROVIDER = "rules-fallback" as const;
export const FALLBACK_MODEL = "rules-v1";

type Kind = "co2" | "temp" | "aforo" | "energia" | "otro";

function kindOf(ctx: DiagnoseContext): Kind {
  const m = ctx.rule?.metric;
  if (m === "co2_ppm") return "co2";
  if (m === "temp_c") return "temp";
  if (m === "occupancy_ratio" || m === "occupancy") return "aforo";
  if (m === "power_w") return "energia";
  return "otro";
}

/**
 * Diagnostico determinista por tipo de regla (sin IA). La evidencia sale solo de
 * las lecturas reales del contexto; si no hay lecturas, no se cita evidencia.
 */
export function buildRuleDiagnosis(ctx: DiagnoseContext, confianza: number): AiDiagnosis {
  const s = ctx.readings.summary;
  const dev = ctx.device_id;
  const evidencia: AiDiagnosis["evidencia"] = [];
  const add = (metric: Metric, pick: "last" | "max") => {
    const m = s[metric];
    if (dev && m) evidencia.push({ device_id: dev, metric, valor: round(m[pick], 2) });
  };
  const sp = ctx.space;
  const occ = s.occupancy?.last;
  const occTxt = occ !== undefined ? `${Math.round(occ)}/${sp.capacity} personas` : "ocupación sin dato";
  const kind = kindOf(ctx);
  let causa: string;
  let acciones: string[];

  if (kind === "co2") {
    add("co2_ppm", "last");
    add("occupancy", "last");
    const c = s.co2_ppm;
    causa = c
      ? `CO2 elevado en ${sp.name}: ${round(c.last, 0)} ppm (máximo ${round(c.max, 0)} ppm en ${ctx.readings.window_min} min) frente al umbral de ${ctx.rule?.threshold} ppm, con ${occTxt}. Lo más probable es ventilación insuficiente o aforo alto.`
      : `Regla de CO2 activada en ${sp.name}, pero no hay lecturas recientes en el contexto para confirmar la causa.`;
    acciones = [
      "Aumentar la ventilación (abrir puertas y ventanas o activar la ventilación mecánica).",
      "Verificar el aforo y, si es alto, redistribuir o reducir la cantidad de personas.",
      "Confirmar que el sensor de CO2 reporta valores coherentes.",
    ];
  } else if (kind === "temp") {
    add("temp_c", "last");
    add("occupancy", "last");
    const t = s.temp_c;
    causa = t
      ? `Temperatura alta en ${sp.name}: ${round(t.last, 1)} C (máximo ${round(t.max, 1)} C en ${ctx.readings.window_min} min) frente al umbral de ${ctx.rule?.threshold} C, con ${occTxt}. Posible falla o insuficiencia de climatización.`
      : `Regla de temperatura activada en ${sp.name}, pero no hay lecturas recientes en el contexto para confirmar la causa.`;
    acciones = [
      "Revisar el funcionamiento y la configuración del equipo de climatización.",
      "Mejorar la ventilación natural mientras se resuelve la causa.",
      "Derivar a mantenimiento si la temperatura no baja en 30 minutos.",
    ];
  } else if (kind === "aforo") {
    add("occupancy", "last");
    add("co2_ppm", "last");
    causa =
      occ !== undefined
        ? `Sobreaforo en ${sp.name}: ${Math.round(occ)} personas para una capacidad de ${sp.capacity} (${Math.round((occ / sp.capacity) * 100)} %). Se recomienda redistribuir la ocupación.`
        : `Regla de aforo activada en ${sp.name}, pero no hay lecturas recientes de ocupación en el contexto.`;
    acciones = [
      "Redistribuir parte de los asistentes a otros espacios con aforo disponible.",
      "Controlar el acceso hasta que la ocupación baje del aforo máximo.",
      "Vigilar el CO2 del espacio mientras persista la alta ocupación.",
    ];
  } else if (kind === "energia") {
    add("power_w", "last");
    add("occupancy", "last");
    const w = s.power_w;
    causa = w
      ? `Consumo eléctrico alto en ${sp.name}: ${Math.round(w.last)} W (máximo ${Math.round(w.max)} W en ${ctx.readings.window_min} min) frente al umbral de ${ctx.rule?.threshold} W, con ${occTxt}. Posibles equipos encendidos sin uso, climatización forzada o una carga anómala.`
      : `Regla de consumo eléctrico activada en ${sp.name}, pero no hay lecturas recientes de potencia en el contexto.`;
    acciones = [
      "Verificar qué equipos o circuitos están encendidos y apagar los que no estén en uso.",
      "Revisar la climatización y los equipos de alto consumo del espacio.",
      "Derivar a mantenimiento eléctrico si el consumo no baja o hay olor o calor anómalo en tableros.",
    ];
  } else {
    add("co2_ppm", "last");
    add("temp_c", "last");
    causa = `Regla "${ctx.rule?.name ?? "desconocida"}" activada en ${sp.name}. No hay una pauta específica para este tipo de regla; se requiere revisión manual.`;
    acciones = ["Revisar manualmente las lecturas del espacio y el estado del sensor."];
  }

  return {
    causa_probable: causa.slice(0, 600),
    severidad: ctx.rule?.severity ?? ctx.incident.severity,
    acciones,
    evidencia: evidencia.slice(0, 10),
    confianza,
  };
}

export function rulesFallbackDiagnosis(ctx: DiagnoseContext): AiDiagnosis {
  return buildRuleDiagnosis(ctx, 0.5);
}

export function fallbackMeta(now: number): AiOutputMeta {
  return { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL, mode: "fallback", created_at: now, latency_ms: null };
}
