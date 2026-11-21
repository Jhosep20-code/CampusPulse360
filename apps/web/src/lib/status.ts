import type { IncidentStatus, Severity, SpaceStatus } from "@campuspulse/contracts";
import {
  CircleCheck,
  CircleDot,
  Hourglass,
  Info,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

/** Estilo de un estado: SIEMPRE icono + texto, nunca solo color. */
export interface StatusMeta {
  label: string;
  Icon: LucideIcon;
  /** Clases Tailwind para texto, fondo y borde. */
  cls: string;
  /** Color hexadecimal (para SVG/graficos). */
  hex: string;
}

export const SPACE_STATUS: Record<SpaceStatus, StatusMeta> = {
  ok: { label: "Normal", Icon: CircleCheck, cls: "text-ok bg-ok/10 border-ok/40", hex: "#22D3D6" },
  warning: { label: "Advertencia", Icon: TriangleAlert, cls: "text-warn bg-warn/10 border-warn/40", hex: "#F0B95B" },
  critical: { label: "Crítico", Icon: OctagonAlert, cls: "text-crit bg-crit/10 border-crit/40", hex: "#FF5C7A" },
  offline: { label: "Sin conexión", Icon: WifiOff, cls: "text-ink-2 bg-off/15 border-off/50", hex: "#64748B" },
};

export const SEVERITY: Record<Severity, StatusMeta> = {
  info: { label: "Informativa", Icon: Info, cls: "text-link bg-brand/15 border-brand/50", hex: "#7C9BFF" },
  warning: { label: "Advertencia", Icon: TriangleAlert, cls: "text-warn bg-warn/10 border-warn/40", hex: "#F0B95B" },
  critical: { label: "Crítica", Icon: OctagonAlert, cls: "text-crit bg-crit/10 border-crit/40", hex: "#FF5C7A" },
};

export const INCIDENT_STATUS: Record<IncidentStatus, StatusMeta> = {
  pending_ai: { label: "Pendiente de IA", Icon: Hourglass, cls: "text-link bg-brand/15 border-brand/50", hex: "#7C9BFF" },
  open: { label: "Abierta", Icon: CircleDot, cls: "text-warn bg-warn/10 border-warn/40", hex: "#F0B95B" },
  acknowledged: { label: "Reconocida", Icon: ShieldCheck, cls: "text-link bg-brand/15 border-brand/50", hex: "#7C9BFF" },
  resolved: { label: "Resuelta", Icon: CircleCheck, cls: "text-ok bg-ok/10 border-ok/40", hex: "#22D3D6" },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 2, warning: 1, info: 0 };
export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export const METRIC_LABEL = {
  co2_ppm: { label: "CO₂", unit: "ppm" },
  temp_c: { label: "Temperatura", unit: "°C" },
  rh_pct: { label: "Humedad", unit: "%" },
  occupancy: { label: "Ocupación", unit: "pers." },
  power_w: { label: "Potencia", unit: "W" },
} as const;
