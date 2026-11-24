import { Activity, Bot, Brain, Box, Cpu, Database, ListChecks, TriangleAlert, type LucideIcon } from "lucide-react";
import type { PipelineStep } from "../demo/pipeline";

const ICONS: Record<PipelineStep["id"], LucideIcon> = {
  sensor: Cpu,
  api: Database,
  rules: ListChecks,
  bot: Bot,
  incident: Activity,
  ai: Brain,
  twin: Box,
};

const SHORT: Record<PipelineStep["id"], string> = {
  sensor: "Sensor",
  api: "API",
  rules: "Reglas",
  bot: "Bot",
  incident: "Incidencia",
  ai: "IA",
  twin: "Gemelo",
};

/**
 * Flujo animado de la automatizacion sobre el gemelo. Cada etapa se ilumina SOLO cuando el backend lo confirma
 * (estados de pipelineSteps); la etapa pendiente actual late; el conector se llena al completarse la anterior.
 * Si el diagnostico vino del respaldo por reglas, la etapa IA queda en dorado con "sin IA".
 */
export function FlowStrip({ steps, reduced }: { steps: readonly PipelineStep[]; reduced: boolean }) {
  const current = steps.findIndex((s) => s.state === "pending");
  return (
    <ol className="m-0 flex list-none items-center gap-0 overflow-x-auto rounded-xl border border-line bg-panel/90 p-1.5 shadow-lg" aria-label="Flujo de la automatización (datos del backend)">
      {steps.map((s, i) => {
        const Icon = s.state === "warn" ? TriangleAlert : ICONS[s.id];
        const done = s.state === "done";
        const warn = s.state === "warn";
        const skipped = s.state === "skipped";
        const active = i === current;
        const tone = done ? "border-ok text-ok bg-ok/10" : warn ? "border-gold text-gold bg-gold/10" : skipped ? "border-line text-ink-2 opacity-50" : active ? "border-link text-link" : "border-line text-ink-2";
        return (
          <li key={s.id} className="flex items-center" title={`${s.label}: ${s.detail}`}>
            {i > 0 ? (
              <span className="relative mx-0.5 h-0.5 w-3 overflow-hidden rounded bg-line sm:w-5" aria-hidden="true">
                <span
                  className="absolute inset-y-0 left-0 bg-ok"
                  style={{ width: steps[i - 1]!.state === "pending" ? "0%" : "100%", transition: reduced ? "none" : "width .6s ease-out" }}
                />
              </span>
            ) : null}
            <span
              className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium sm:text-[11px] ${tone} ${active && !reduced ? "motion-safe:animate-pulse" : ""}`}
              style={{ transition: reduced ? "none" : "background-color .5s, color .5s, border-color .5s" }}
            >
              <Icon size={12} aria-hidden="true" />
              <span className="hidden sm:inline">{SHORT[s.id]}</span>
              {warn ? <span className="hidden sm:inline">· sin IA</span> : null}
              <span className="sr-only">
                {s.label}: {done ? "confirmado" : warn ? "respaldo sin IA" : skipped ? "no aplica" : "pendiente"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
