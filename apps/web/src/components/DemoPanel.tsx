import type { BotRun, CustomScenarioResponse, Incident, ScenarioKind, Space } from "@campuspulse/contracts";
import { CheckCircle2, CircleDashed, CircleMinus, FlaskConical, Loader2, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveCtx } from "../app/context";
import { api } from "../lib/api";
import { launchIncident, pipelineSettled, pipelineSteps, type PipelineStep, type StepState } from "../demo/pipeline";

const KINDS: Array<{ id: ScenarioKind; label: string }> = [
  { id: "co2", label: "CO₂ elevado" },
  { id: "temperature", label: "Temperatura anómala" },
  { id: "occupancy", label: "Sobreaforo" },
  { id: "power", label: "Consumo eléctrico" },
  { id: "offline", label: "Sin conexión" },
];

/** Sondeo de incidencias y ejecuciones del bot mientras la demo esta en curso (/live ya lo sondea la app). */
const POLL_MS = 5000;
/** Tope de sondeo (la incidencia aparece en 1-2 ciclos del cron; el diagnostico en el siguiente). */
const MAX_POLL_MS = 6 * 60_000;

const ICON: Record<StepState, { Icon: typeof CheckCircle2; cls: string; sr: string }> = {
  done: { Icon: CheckCircle2, cls: "text-ok", sr: "completado" },
  pending: { Icon: CircleDashed, cls: "text-ink-2", sr: "pendiente" },
  skipped: { Icon: CircleMinus, cls: "text-ink-2", sr: "no aplica" },
  warn: { Icon: TriangleAlert, cls: "text-gold", sr: "aviso" },
};

export interface DemoPanelProps {
  spaces: readonly Space[];
  /** Pide al gemelo enfocar el piso y el espacio afectados. */
  onFocus: (space: Space) => void;
  /** Espacio sugerido (p. ej. el seleccionado en el gemelo). */
  suggestedSpaceId?: string | null;
  /** Pasos actuales (para el flujo animado sobre el gemelo); null sin escenario activo. */
  onSteps?: (steps: PipelineStep[] | null) => void;
}

/**
 * Panel de demostracion (solo admin): lanza un escenario SIMULADO en cualquier espacio instrumentado y muestra, con
 * datos reales de la API, el avance Sensor -> API -> reglas -> bot -> incidencia -> IA -> gemelo. No hace llamadas de
 * IA: el diagnostico lo pide el bot del servidor (1 por minuto).
 */
export function DemoPanel({ spaces, onFocus, suggestedSpaceId, onSteps }: DemoPanelProps) {
  const live = useLiveCtx();
  const sorted = useMemo(() => [...spaces].sort((a, b) => a.level - b.level || a.code.localeCompare(b.code)), [spaces]);
  const [spaceId, setSpaceId] = useState<string>(() => sorted.find((s) => s.code !== "A301")?.id ?? sorted[0]?.id ?? "");
  const [kind, setKind] = useState<ScenarioKind>("co2");
  const [level, setLevel] = useState<"warning" | "critical">("critical");
  const [duration, setDuration] = useState(8);
  const [launch, setLaunch] = useState<CustomScenarioResponse | null>(null);
  const [runs, setRuns] = useState<BotRun[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [busy, setBusy] = useState<"launch" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const focused = useRef<string | null>(null);

  useEffect(() => {
    if (suggestedSpaceId && !launch && spaces.some((s) => s.id === suggestedSpaceId)) setSpaceId(suggestedSpaceId);
  }, [suggestedSpaceId, launch, spaces]);

  const liveSpace = launch ? live.data?.spaces.find((s) => s.space_id === launch.space_id) : undefined;
  const steps = launch ? pipelineSteps({ launch, live: liveSpace, botRuns: runs, incidents }) : [];
  const settled = steps.length > 0 && pipelineSettled(steps);
  const stepsKey = steps.map((x) => x.state + x.detail).join("|");
  const onStepsRef = useRef(onSteps);
  onStepsRef.current = onSteps;
  useEffect(() => {
    onStepsRef.current?.(launch ? steps : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, launch]);

  // Sondeo acotado: se detiene al resolverse todo o a los 6 min. Pausa con la pestana oculta.
  useEffect(() => {
    if (!launch || settled) return;
    let stop = false;
    const ctrl = new AbortController();
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const [r, inc] = await Promise.all([api.botRuns(ctrl.signal), api.incidents({ space_id: launch.space_id, limit: 10 }, ctrl.signal)]);
        if (!stop) {
          setRuns(r);
          setIncidents(inc.items);
        }
      } catch {
        /* reintento en el siguiente ciclo */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (Date.now() - launch.started_at > MAX_POLL_MS) {
        window.clearInterval(id);
        return;
      }
      void tick();
    }, POLL_MS);
    return () => {
      stop = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [launch, settled]);

  // Cuando hay incidencia (o el espacio pasa a sin conexion) el gemelo enfoca el piso y el aula, una sola vez.
  const inc = launch ? launchIncident({ launch, live: liveSpace, botRuns: runs, incidents }) : undefined;
  const reached = launch && (inc || (launch.kind === "offline" && liveSpace?.status === "offline") || (launch.expected_rules.length === 0 && liveSpace && liveSpace.status !== "ok"));
  useEffect(() => {
    if (!launch || !reached || focused.current === launch.space_id + launch.started_at) return;
    const sp = spaces.find((s) => s.id === launch.space_id);
    if (sp) {
      focused.current = launch.space_id + launch.started_at;
      onFocus(sp);
    }
  }, [launch, reached, spaces, onFocus]);

  async function start() {
    setBusy("launch");
    setError(null);
    setNote(null);
    try {
      const r = await api.scenarioCustom({ space_id: spaceId, kind, level, duration_min: duration });
      setRuns([]);
      setIncidents([]);
      setLaunch(r);
      // El gemelo refleja la lectura en cuanto /live la devuelve (sin esperar el ciclo de 10 s).
      live.refresh?.();
      const sp = spaces.find((s) => s.id === r.space_id);
      if (sp) onFocus(sp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo lanzar el escenario");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    const target = launch?.space_id ?? spaceId;
    setBusy("restore");
    setError(null);
    try {
      const r = await api.scenarioRestore(target);
      setLaunch(null);
      live.refresh?.();
      setNote(`Restaurado: ${r.removed ? "escenario retirado" : "sin escenario activo"}, ${r.resolved} incidencia(s) cerrada(s) y lectura normal registrada.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restaurar");
    } finally {
      setBusy(null);
    }
  }

  const selected = spaces.find((s) => s.id === spaceId);
  return (
    <section className="panel" aria-labelledby="demo-title">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="demo-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FlaskConical size={16} aria-hidden="true" className="text-link" /> Demostración
        </h2>
        <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">Datos simulados</span>
      </div>
      <div className="space-y-2 p-3 text-[13px]">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-ink-2">
            Espacio
            <select className="field mt-1 !min-h-[34px] !py-0" value={spaceId} disabled={!!launch} onChange={(e) => setSpaceId(e.target.value)}>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  P{s.level} · {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-2">
            Anomalía
            <select className="field mt-1 !min-h-[34px] !py-0" value={kind} disabled={!!launch} onChange={(e) => setKind(e.target.value as ScenarioKind)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-2">
            Intensidad
            <select className="field mt-1 !min-h-[34px] !py-0" value={level} disabled={!!launch || kind === "offline"} onChange={(e) => setLevel(e.target.value as "warning" | "critical")}>
              <option value="warning">Advertencia</option>
              <option value="critical">Crítica</option>
            </select>
          </label>
          <label className="col-span-2 text-xs text-ink-2">
            Duración: {duration} min
            <input type="range" min={3} max={15} value={duration} disabled={!!launch} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-full accent-[#22D3D6]" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={start} disabled={busy !== null || !!launch || !selected}>
            {busy === "launch" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Lanzar escenario
          </button>
          <button type="button" className="btn btn-sm" onClick={restore} disabled={busy !== null || (!launch && !selected)}>
            <RotateCcw size={14} aria-hidden="true" /> Restaurar
          </button>
        </div>
        {error ? <p className="m-0 text-xs text-crit" role="alert">{error}</p> : null}
        {note ? <p className="m-0 text-xs text-ink-2" role="status">{note}</p> : null}
        {launch ? (
          <ol className="m-0 list-none space-y-1.5 p-0" aria-label="Avance del sistema" aria-live="polite">
            {steps.map((s, i) => {
              const ic = ICON[s.state];
              return (
                <li key={s.id} className="flex gap-2">
                  <ic.Icon size={16} className={`mt-0.5 shrink-0 ${ic.cls}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="m-0 text-[12px] font-medium text-ink">
                      {i + 1}. {s.label} <span className="sr-only">({ic.sr})</span>
                    </p>
                    <p className="m-0 break-words text-[11px] text-ink-2">{s.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="m-0 text-[11px] text-ink-2">
            Inserta lecturas «sim-scenario» (rampa de 2 min y 4 min sostenidos) y el bot del servidor las evalúa en su siguiente ciclo. Restaurar cierra solo
            las incidencias de ese espacio.
          </p>
        )}
      </div>
    </section>
  );
}
