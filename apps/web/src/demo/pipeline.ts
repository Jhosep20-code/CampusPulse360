import type { BotRun, CustomScenarioResponse, Incident, LiveSpace } from "@campuspulse/contracts";

/*
 * Pasos verificables de la demostracion: Sensor simulado -> API/D1 -> reglas -> automatizacion -> incidencia ->
 * diagnostico IA -> gemelo. Cada estado se DERIVA de datos reales de la API (respuesta del escenario, /live,
 * /bots/runs, /incidents); nada se marca como hecho por tiempo ni se inventa.
 */

export type StepState = "pending" | "done" | "skipped" | "warn";

export interface PipelineStep {
  id: "sensor" | "api" | "rules" | "bot" | "incident" | "ai" | "twin";
  label: string;
  state: StepState;
  detail: string;
}

export interface PipelineInput {
  launch: CustomScenarioResponse;
  live: LiveSpace | undefined;
  botRuns: readonly BotRun[];
  incidents: readonly Incident[];
}

/** Margen para relojes: las incidencias y ejecuciones se buscan desde 1 s antes del lanzamiento. */
const SKEW_MS = 1000;

/** Severidad en espanol para el panel (la fuente de verdad es la regla del backend). */
export const SEV_ES: Record<string, string> = { critical: "crítica", warning: "advertencia", info: "informativa" };
const SEV_RANK: Record<string, number> = { critical: 2, warning: 1, info: 0 };

export function hhmmss(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Incidencia abierta por el bot para este lanzamiento (una de las reglas esperadas, abierta despues de lanzar). */
export function launchIncident(input: PipelineInput): Incident | undefined {
  const ids = new Set(input.launch.expected_rules.map((r) => r.id));
  return input.incidents
    .filter((i) => i.space_id === input.launch.space_id && i.opened_at >= input.launch.started_at - SKEW_MS && (i.rule_id === null || ids.has(i.rule_id)))
    .sort((a, b) => a.opened_at - b.opened_at)[0];
}

export function pipelineSteps(input: PipelineInput): PipelineStep[] {
  const { launch, live } = input;
  const offline = launch.kind === "offline";
  const hasRules = launch.expected_rules.length > 0;
  const run = input.botRuns
    .filter((r) => r.bot === "incident-bot" && r.started_at >= launch.started_at - SKEW_MS && r.status !== "running")
    .sort((a, b) => a.started_at - b.started_at)[0];
  const inc = launchIncident(input);
  const fresh = live?.last_ts != null && live.last_ts >= launch.started_at - 6 * 60_000;

  const sensor: PipelineStep = offline
    ? {
        id: "sensor",
        label: "Sensor simulado",
        state: "done",
        detail: `Desconectado desde ${hhmmss(launch.started_at)}: ni el bot ni el simulador envían lecturas.`,
      }
    : live?.source === "sim-scenario" && fresh
      ? { id: "sensor", label: "Sensor simulado", state: "done", detail: `Última lectura ${hhmmss(live.last_ts!)} (sim-scenario).` }
      : { id: "sensor", label: "Sensor simulado", state: "pending", detail: "Esperando la lectura del escenario en /live…" };

  const api: PipelineStep = offline
    ? { id: "api", label: "API y D1", state: "skipped", detail: "Sin lecturas que registrar (desconexión)." }
    : { id: "api", label: "API y D1", state: "done", detail: `${launch.inserted} lecturas sim-scenario guardadas en D1.` };

  const rules: PipelineStep = hasRules
    ? {
        id: "rules",
        label: "Reglas",
        state: "done",
        // La mas severa primero: es la que abre la incidencia (suprime la de menor severidad de la misma metrica).
        detail: [...launch.expected_rules]
          .sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))
          .map((r) => `${r.name} (${SEV_ES[r.severity] ?? r.severity})`)
          .join(" · "),
      }
    : {
        id: "rules",
        label: "Reglas",
        state: "skipped",
        detail: offline ? "No hay regla de incidencia para desconexión: se refleja como estado «sin conexión»." : "El perfil no cruza ninguna regla de incidencia (solo cambia el estado).",
      };

  const bot: PipelineStep = !hasRules
    ? { id: "bot", label: "Automatización (bot RPA)", state: "skipped", detail: "Sin reglas que evaluar para este escenario." }
    : run
      ? { id: "bot", label: "Automatización (bot RPA)", state: "done", detail: `incident-bot ${hhmmss(run.started_at)}: ${run.summary || run.status}` }
      : { id: "bot", label: "Automatización (bot RPA)", state: "pending", detail: "Esperando el próximo ciclo del cron (cada minuto)…" };

  const incident: PipelineStep = !hasRules
    ? { id: "incident", label: "Incidencia", state: "skipped", detail: "No corresponde." }
    : inc
      ? { id: "incident", label: "Incidencia", state: "done", detail: `${inc.title} · ${SEV_ES[inc.severity] ?? inc.severity} · abierta ${hhmmss(inc.opened_at)}` }
      : { id: "incident", label: "Incidencia", state: "pending", detail: run ? "El bot ya corrió; esperando la detección sostenida…" : "Pendiente del bot." };

  let ai: PipelineStep;
  if (!hasRules) ai = { id: "ai", label: "Diagnóstico IA", state: "skipped", detail: "No corresponde." };
  else if (!inc?.diagnosis_meta) ai = { id: "ai", label: "Diagnóstico IA", state: "pending", detail: inc ? "En cola del bot (1 diagnóstico por minuto)…" : "Pendiente de la incidencia." };
  else {
    const m = inc.diagnosis_meta;
    const live_ = m.mode === "live" || m.mode === "cached";
    ai = {
      id: "ai",
      label: "Diagnóstico IA",
      state: live_ ? "done" : "warn",
      detail: live_
        ? `${m.provider} · ${m.model}${m.latency_ms != null ? ` · ${m.latency_ms} ms` : ""}${inc.diagnosis ? ` — ${inc.diagnosis.causa_probable}` : ""}`
        : `Respaldo por reglas (sin IA): ${m.model}${inc.diagnosis ? ` — ${inc.diagnosis.causa_probable}` : ""}`,
    };
  }

  const twinDone = offline ? live?.status === "offline" : live !== undefined && live.status !== "ok" && live.status !== "offline";
  const twin: PipelineStep = twinDone
    ? { id: "twin", label: "Gemelo actualizado", state: "done", detail: `Estado del espacio: ${live!.status === "offline" ? "sin conexión" : live!.status === "critical" ? "crítico" : "advertencia"}.` }
    : {
        id: "twin",
        label: "Gemelo actualizado",
        state: "pending",
        detail: offline ? "Pasa a «sin conexión» tras 3 min sin lecturas (como un sensor real caído)." : "Esperando que /live refleje el nuevo estado…",
      };

  return [sensor, api, rules, bot, incident, ai, twin];
}

/** La demostracion ya no necesita sondear (todo resuelto u omitido). */
export function pipelineSettled(steps: readonly PipelineStep[]): boolean {
  return steps.every((s) => s.state !== "pending");
}
