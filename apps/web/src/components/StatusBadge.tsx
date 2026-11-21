import type { IncidentStatus, Severity, SpaceStatus } from "@campuspulse/contracts";
import { INCIDENT_STATUS, SEVERITY, SPACE_STATUS, type StatusMeta } from "../lib/status";

function Badge({ meta, size = "md", label }: { meta: StatusMeta; size?: "sm" | "md" | "lg"; label?: string }) {
  const { Icon } = meta;
  const dims = size === "sm" ? "text-[11px] px-1.5 py-0.5 gap-1" : size === "lg" ? "text-base px-3 py-1.5 gap-2" : "text-xs px-2 py-1 gap-1.5";
  const icon = size === "lg" ? 20 : size === "sm" ? 12 : 14;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${dims} ${meta.cls}`}>
      <Icon size={icon} aria-hidden="true" strokeWidth={2.2} />
      <span>{label ?? meta.label}</span>
    </span>
  );
}

/** Estado de un espacio: icono + texto, nunca solo color. */
export function StatusBadge({ status, size }: { status: SpaceStatus; size?: "sm" | "md" | "lg" }) {
  return <Badge meta={SPACE_STATUS[status]} {...(size ? { size } : {})} />;
}

export function SeverityBadge({ severity, size }: { severity: Severity; size?: "sm" | "md" | "lg" }) {
  return <Badge meta={SEVERITY[severity]} {...(size ? { size } : {})} />;
}

export function IncidentStatusBadge({ status, size }: { status: IncidentStatus; size?: "sm" | "md" | "lg" }) {
  return <Badge meta={INCIDENT_STATUS[status]} {...(size ? { size } : {})} />;
}
