import type { IncidentStatus, Severity, SpaceStatus } from "@campuspulse/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INCIDENT_STATUS, SEVERITY, SPACE_STATUS } from "../lib/status";
import { IncidentStatusBadge, SeverityBadge, StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  const states: SpaceStatus[] = ["ok", "warning", "critical", "offline"];

  it.each(states)("muestra texto e icono para el estado %s", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(SPACE_STATUS[status].label)).toBeInTheDocument();
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["info", "warning", "critical"] as Severity[])("la severidad %s lleva icono y texto", (s) => {
    const { container } = render(<SeverityBadge severity={s} />);
    expect(screen.getByText(SEVERITY[s].label)).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it.each(["pending_ai", "open", "acknowledged", "resolved"] as IncidentStatus[])(
    "el estado de incidencia %s lleva icono y texto",
    (s) => {
      const { container } = render(<IncidentStatusBadge status={s} />);
      expect(screen.getByText(INCIDENT_STATUS[s].label)).toBeInTheDocument();
      expect(container.querySelector("svg")).not.toBeNull();
    },
  );
});
