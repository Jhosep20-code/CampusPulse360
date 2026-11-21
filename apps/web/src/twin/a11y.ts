import type { CampusResponse, LiveSnapshot, LiveSpace } from "@campuspulse/contracts";
import { LAYER_LABEL, STATUS_LABEL, primaryValueLabel } from "./colors";
import type { TwinLayer } from "./types";

/** Textos accesibles del gemelo (funciones puras). */

export function liveBySpaceId(live: LiveSnapshot | null): Map<string, LiveSpace> {
  return new Map((live?.spaces ?? []).map((s) => [s.space_id, s]));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen para aria-label del contenedor role="img". */
export function describeTwin(
  campus: CampusResponse,
  live: LiveSnapshot | null,
  layer: TwinLayer,
  provisional: boolean,
): string {
  const total = campus.spaces.length;
  const parts = [`Gemelo digital: ${plural(total, "espacio", "espacios")}`];
  if (!live) {
    parts.push("datos en vivo cargando");
  } else {
    const map = liveBySpaceId(live);
    let warning = 0;
    let critical = 0;
    let offline = 0;
    for (const s of campus.spaces) {
      const st = map.get(s.id)?.status ?? "offline";
      if (st === "critical") critical++;
      else if (st === "warning") warning++;
      else if (st === "offline") offline++;
    }
    parts.push(
      plural(critical, "crítico", "críticos"),
      plural(warning, "en advertencia", "en advertencia"),
      `${offline} sin conexión`,
    );
  }
  let text = `${parts.join(", ")}. Capa activa: ${LAYER_LABEL[layer]}.`;
  if (live?.simulated) text += " Datos simulados.";
  if (provisional) text += " Modelo representativo con geometría provisional.";
  return text;
}

/** Una linea por espacio para la lista visualmente oculta. */
export function describeSpaces(
  campus: CampusResponse,
  live: LiveSnapshot | null,
  layer: TwinLayer,
): Array<{ id: string; text: string }> {
  const map = liveBySpaceId(live);
  return [...campus.spaces]
    .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
    .map((s) => {
      const l = map.get(s.id);
      const status = STATUS_LABEL[l?.status ?? "offline"];
      const value = primaryValueLabel(layer, l, s.capacity);
      const extra = layer === "status" || value === status ? "" : `, ${LAYER_LABEL[layer]}: ${value}`;
      return { id: s.id, text: `${s.name}, piso ${s.level}: ${status}${extra}` };
    });
}
