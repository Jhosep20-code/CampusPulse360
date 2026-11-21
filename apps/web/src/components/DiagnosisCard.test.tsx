import type { AiDiagnosis, AiOutputMeta } from "@campuspulse/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fmtDateTime } from "../lib/format";
import { DiagnosisCard } from "./DiagnosisCard";

const diagnosis: AiDiagnosis = {
  causa_probable: "Ventilación insuficiente con aula llena.",
  severidad: "warning",
  acciones: ["Abrir ventanas", "Reducir aforo"],
  evidencia: [{ device_id: "dev-1", metric: "co2_ppm", valor: 1320 }],
  confianza: 0.82,
};

function meta(mode: AiOutputMeta["mode"]): AiOutputMeta {
  return {
    provider: mode === "fallback" ? "rules-fallback" : "workers-ai",
    model: mode === "fallback" ? "rules-v1" : "llama-test",
    mode,
    created_at: 1_700_000_000_000,
    latency_ms: 420,
  };
}

describe("DiagnosisCard", () => {
  it("modo fallback: diagnostico por reglas sin IA", () => {
    render(<DiagnosisCard diagnosis={diagnosis} meta={meta("fallback")} />);
    expect(screen.getByText("Diagnóstico por reglas — sin IA")).toBeInTheDocument();
  });

  it("modo cached: fecha de generacion y modelo", () => {
    render(<DiagnosisCard diagnosis={diagnosis} meta={meta("cached")} />);
    expect(screen.getByText(`Inferencia de IA · llama-test · generado el ${fmtDateTime(1_700_000_000_000)}`)).toBeInTheDocument();
  });

  it("proveedor mock nunca se presenta como IA real", () => {
    render(<DiagnosisCard diagnosis={diagnosis} meta={{ ...meta("live"), provider: "mock" }} />);
    expect(screen.getByText("IA simulada (mock de pruebas) — sin inferencia real")).toBeInTheDocument();
    expect(screen.queryByText(/Inferencia de IA/)).toBeNull();
  });

  it("modo live: inferencia con modelo y fecha", () => {
    render(<DiagnosisCard diagnosis={diagnosis} meta={meta("live")} />);
    expect(screen.getByText(`Inferencia de IA · llama-test · generado el ${fmtDateTime(1_700_000_000_000)}`)).toBeInTheDocument();
    expect(screen.getByText("Abrir ventanas")).toBeInTheDocument();
    expect(screen.getByText("82 %")).toBeInTheDocument();
  });

  it("sin diagnostico muestra estado pendiente", () => {
    render(<DiagnosisCard diagnosis={null} meta={null} pending />);
    expect(screen.getByText(/pendiente de generación/i)).toBeInTheDocument();
  });
});
