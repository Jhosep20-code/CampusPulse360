import {
  Activity,
  BellRing,
  Box,
  Eye,
  Flame,
  Footprints,
  Layers,
  Moon,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Thermometer,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Space } from "@campuspulse/contracts";
import { INITIAL_VIEW, reduceView, type ViewAction } from "../twin/view-state";
import { buildTour, pickTourTarget, type TourStep } from "../twin/tour";
import { useGuidedTour } from "../twin/useGuidedTour";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { DemoPanel } from "../components/DemoPanel";
import { FlowStrip } from "../components/FlowStrip";
import type { PipelineStep } from "../demo/pipeline";
import { Link, useLocation } from "react-router";
import { TWIN_LEVELS } from "../twin/constants";
import type { TwinLayer } from "../twin/types";
import { useCampusCtx, useLiveCtx, useRole, useSpaceIndex } from "../app/context";
import { KpiCard } from "../components/KpiCard";
import { SpacePanel } from "../components/SpacePanel";
import { SeverityBadge, StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorBoundary, ErrorState, PageHeader, Panel, Skeleton, SkeletonRows } from "../components/ui";
import { useActiveIncidents } from "../hooks/useActiveIncidents";
import { fmtAgo, fmtDec, fmtInt, fmtKw, fmtPct } from "../lib/format";
import { SPACE_STATUS } from "../lib/status";

// El gemelo 3D (three) vive en su propio chunk y se carga bajo demanda.
const CampusTwin = lazy(() => import("../twin/CampusTwin"));

const LAYERS: Array<{ id: TwinLayer; label: string }> = [
  { id: "status", label: "Estado" },
  { id: "co2", label: "CO₂" },
  { id: "temperature", label: "Temperatura" },
  { id: "occupancy", label: "Ocupación" },
  { id: "energy", label: "Energía" },
];

function TwinSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-4" role="status" aria-label="Cargando gemelo digital">
      <Skeleton className="h-full w-full" />
      <span className="sr-only">Cargando gemelo digital…</span>
    </div>
  );
}

interface FocusState {
  focusSpaceIds?: string[];
}

export default function CommandCenter() {
  const live = useLiveCtx();
  const campus = useCampusCtx();
  const spaces = useSpaceIndex();
  const location = useLocation();
  const focusSpaceIds = (location.state as FocusState | null)?.focusSpaceIds;

  const [layer, setLayer] = useState<TwinLayer>("status");
  // Estado de la vista del gemelo: unica fuente de verdad con reglas de compatibilidad (view-state.ts).
  const [view, dispatchView] = useReducer(reduceView, INITIAL_VIEW);
  const [resetToken, setResetToken] = useState(0);
  const { exploded, night, dataMode, isolatedLevel: isolated } = view;
  // Manejadores manuales: cancelan el recorrido guiado si esta activo (manual() se define mas abajo).
  // En primera persona el selector de piso cambia el piso por el que se camina (no aisla).
  const setIsolated = (level: number | null) => (fpsLevel !== null && level !== null ? setFpsLevel(level) : manual({ type: "isolate", level }));
  const resetView = () => {
    tour.stop();
    dispatchView({ type: "reset" });
    setResetToken((n) => n + 1);
  };
  const [selected, setSelected] = useState<string | null>(null);
  const { isAdmin } = useRole();
  const reducedMotion = useReducedMotion();

  // Recorrido guiado: secuencia de acciones de la maquina de estados de la vista (las camaras son los presets).
  const statusById = useMemo(() => new Map((live.data?.spaces ?? []).map((s) => [s.space_id, s.status])), [live.data]);
  const [tourSteps, setTourSteps] = useState<TourStep[]>([]);
  const [tourTargetId, setTourTargetId] = useState<string | null>(null);
  const applyTourStep = (step: TourStep) => {
    for (const a of step.actions) dispatchView(a);
    // El token de reinicio re-aplica la camara inicial: solo si el paso TERMINA en reset (si despues pide otro
    // preset, p. ej. Aerea, el token lo pisaria).
    if (step.actions[step.actions.length - 1]?.type === "reset") setResetToken((n) => n + 1);
    if (step.clearSelection) setSelected(null);
    if (step.selectTarget && tourTargetId) setSelected(tourTargetId);
  };
  const tour = useGuidedTour(tourSteps, applyTourStep, reducedMotion);
  const [modelState, setModelState] = useState<"loading" | "glb" | "procedural">("loading");
  const modelReady = modelState !== "loading";
  const [flow, setFlow] = useState<PipelineStep[] | null>(null);
  const tourActive = tour.state.status !== "idle";
  // Recorrido en primera persona (TA5): piso activo o null. Entra con la vista restablecida (sin corte, sin pisos
  // explotados ni aislados) para caminar por el edificio completo; al salir vuelve la camara orbital.
  const [fpsLevel, setFpsLevel] = useState<number | null>(null);
  const enterFirstPerson = () => {
    tour.stop();
    const start = isolated ?? 1;
    dispatchView({ type: "reset" });
    setSelected(null);
    setFpsLevel(start);
  };
  const startTour = () => {
    setFpsLevel(null);
    const t = pickTourTarget(campus.data?.spaces ?? [], statusById, selected);
    if (!t) return;
    setTourTargetId(t.spaceId);
    setTourSteps(buildTour(t));
    tour.play();
  };
  /** Cualquier accion manual cancela el recorrido (la vista queda donde el usuario la deja). */
  const manual = (a: ViewAction) => {
    if (tourActive) tour.stop();
    dispatchView(a);
  };
  // Tras el enfoque automatico de una alerta, la camara orbita despacio unos segundos (se corta al interactuar).
  const [focusOrbitUntil, setFocusOrbitUntil] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (focusOrbitUntil <= Date.now()) return;
    const id = window.setTimeout(() => setNowTick((n) => n + 1), focusOrbitUntil - Date.now() + 50);
    return () => window.clearTimeout(id);
  }, [focusOrbitUntil]);
  const focusOrbit = focusOrbitUntil > Date.now() + nowTick * 0;
  const onDemoFocus = useCallback(
    (space: Space) => {
      tour.stop();
      setFpsLevel(null);
      dispatchView({ type: "isolate", level: space.level });
      setSelected(space.id);
      setFocusOrbitUntil(Date.now() + 14_000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const k = live.data?.kpis;
  const incidents = useActiveIncidents(k?.open_incidents);
  const liveBySpace = useMemo(() => new Map((live.data?.spaces ?? []).map((s) => [s.space_id, s])), [live.data]);
  const selectedSpace = selected ? spaces.get(selected) : undefined;
  // P1-P10 (P6-P10 existen en el modelo aunque no tengan espacios instrumentados).
  const levels = TWIN_LEVELS;

  /** Barra del recorrido: superpuesta abajo en escritorio y DEBAJO del lienzo en movil (no tapa el modelo). */
  const renderTourBar = (cls: string) =>
    tour.step ? (
      <div
                className={`rounded-xl border border-line bg-panel/95 p-3 shadow-lg ${cls}`}
                role="region"
                aria-label="Recorrido guiado"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-ink-2">
                    Recorrido guiado · paso {tour.state.index + 1} de {tourSteps.length}
                    {tour.state.status === "paused" ? " · en pausa" : ""}
                  </p>
                  <div className="flex gap-1">
                    {tour.state.status === "playing" ? (
                      <button type="button" className="btn btn-sm !min-h-[30px] !px-2" onClick={tour.pause} aria-label="Pausar recorrido">
                        <Pause size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <button type="button" className="btn btn-sm !min-h-[30px] !px-2" onClick={tour.resume} aria-label="Reanudar recorrido">
                        <Play size={14} aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" className="btn btn-sm !min-h-[30px] !px-2" onClick={tour.restart} aria-label="Reiniciar recorrido">
                      <SkipBack size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm !min-h-[30px] !px-2 num"
                      onClick={() => tour.setSpeed(tour.state.speed === 1 ? 0.5 : 1)}
                      aria-label={`Velocidad ${tour.state.speed === 1 ? "normal" : "reducida"}; cambiar`}
                    >
                      {tour.state.speed === 1 ? "1×" : "½×"}
                    </button>
                    <button type="button" className="btn btn-sm !min-h-[30px] !px-2" onClick={tour.stop} aria-label="Salir del recorrido">
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="m-0 mt-1 text-sm font-semibold text-ink" aria-live="polite">{tour.step.title}</p>
                <p className="m-0 hidden text-xs text-ink-2 sm:block">{tour.step.caption}</p>
                <div className="mt-2 h-1 overflow-hidden rounded bg-line" aria-hidden="true">
                  <div className="h-full bg-ok" style={{ width: `${((tour.state.index + 1) / Math.max(1, tourSteps.length)) * 100}%`, transition: reducedMotion ? "none" : "width .3s" }} />
                </div>
              </div>
    ) : null;

  const occRatio = k && k.capacity_total > 0 ? k.occupancy_total / k.capacity_total : 0;
  const dash = "—";

  return (
    <div>
      <PageHeader
        title="Centro de mando"
        subtitle={campus.data ? `${campus.data.building.name} · gemelo digital con telemetría simulada` : "Gemelo digital con telemetría simulada"}
      />

      {live.status === "offline" && !live.data ? (
        <div className="panel mb-4">
          <ErrorState error={new Error("Sin conexión con la API")} title="No hay datos en vivo" />
        </div>
      ) : null}

      {/* Franja de KPIs */}
      <section aria-label="Indicadores clave" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
        {live.data && k ? (
          <>
            <KpiCard label="Espacios normales" value={fmtInt(k.spaces_ok)} unit={`/ ${fmtInt(k.spaces_total)}`} tone="ok" icon={<SPACE_STATUS.ok.Icon size={15} />} />
            <KpiCard label="Advertencia" value={fmtInt(k.spaces_warning)} tone={k.spaces_warning > 0 ? "warn" : "neutral"} icon={<SPACE_STATUS.warning.Icon size={15} />} />
            <KpiCard label="Críticos" value={fmtInt(k.spaces_critical)} tone={k.spaces_critical > 0 ? "crit" : "neutral"} icon={<SPACE_STATUS.critical.Icon size={15} />} />
            <KpiCard label="Sin conexión" value={fmtInt(k.spaces_offline)} tone={k.spaces_offline > 0 ? "off" : "neutral"} icon={<SPACE_STATUS.offline.Icon size={15} />} />
            <KpiCard label="Ocupación" value={fmtInt(k.occupancy_total)} unit={`/ ${fmtInt(k.capacity_total)}`} sub={fmtPct(occRatio)} icon={<Users size={15} />} />
            <KpiCard label="CO₂ medio" value={k.avg_co2_ppm === null ? dash : fmtInt(k.avg_co2_ppm)} unit="ppm" tone={(k.avg_co2_ppm ?? 0) >= 1000 ? "warn" : "neutral"} icon={<Wind size={15} />} />
            <KpiCard label="Temperatura" value={fmtDec(k.avg_temp_c)} unit="°C" icon={<Thermometer size={15} />} />
            <KpiCard label="Potencia" value={fmtKw(k.power_total_w)} unit="kW" icon={<Zap size={15} />} />
            <KpiCard label="Incidencias abiertas" value={fmtInt(k.open_incidents)} tone={k.open_incidents > 0 ? "warn" : "neutral"} icon={<BellRing size={15} />} />
          </>
        ) : (
          Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-[82px]" />)
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Gemelo */}
        <Panel
          title="Gemelo digital"
          icon={<Box size={16} aria-hidden="true" />}
          bodyClassName="p-0"
          actions={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">
              Modelo representativo provisional
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <div role="group" aria-label="Capa de datos" className="flex flex-wrap gap-1.5">
              {LAYERS.map((l) => (
                <button key={l.id} type="button" className="btn btn-sm" aria-pressed={layer === l.id} onClick={() => setLayer(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn btn-sm" aria-pressed={exploded} onClick={() => manual({ type: "explode", on: !exploded })}>
                <Layers size={14} aria-hidden="true" /> Pisos explotados
              </button>
              <label className="sr-only" htmlFor="aislar-piso">
                Aislar piso
              </label>
              <select
                id="aislar-piso"
                className="field !min-h-[34px] !w-auto !py-0 text-[13px]"
                value={fpsLevel !== null ? String(fpsLevel) : isolated === null ? "all" : String(isolated)}
                onChange={(e) => setIsolated(e.target.value === "all" ? null : Number(e.target.value))}
              >
                <option value="all">Todos los pisos</option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    Aislar piso P{l}{campus.data?.spaces.some((s) => s.level === l) ? "" : " (sin espacios)"}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" aria-pressed={dataMode} onClick={() => manual({ type: "data", on: !dataMode })}>
                <Eye size={14} aria-hidden="true" /> Modo datos
              </button>
              <button type="button" className="btn btn-sm" aria-pressed={night} onClick={() => dispatchView({ type: "night", on: !night })}>
                <Moon size={14} aria-hidden="true" /> Modo noche
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={tourActive}
                onClick={() => (tourActive ? tour.stop() : startTour())}
                disabled={!campus.data || (!tourActive && !modelReady)}
                title={modelReady ? "Recorrido guiado: aérea, fachada, atrio, piso y aula con sus sensores" : "Disponible cuando termine de cargar el modelo 3D"}
              >
                {tourActive ? <X size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{" "}
                {tourActive ? "Salir del recorrido" : modelReady ? "Recorrido guiado" : "Cargando modelo 3D…"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={fpsLevel !== null}
                onClick={() => (fpsLevel !== null ? setFpsLevel(null) : enterFirstPerson())}
                disabled={!campus.data || !modelReady}
                title="Recorrido en primera persona: WASD o cruceta para caminar, arrastrar para mirar, Esc para salir"
              >
                <Footprints size={14} aria-hidden="true" /> {fpsLevel !== null ? "Salir de primera persona" : "Primera persona"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => { setFpsLevel(null); resetView(); }} title="Quita aislamiento, explosión, corte y modo datos, y vuelve a la cámara inicial">
                <RotateCcw size={14} aria-hidden="true" /> Restablecer vista
              </button>
            </div>
          </div>

          <div className="relative h-[52vh] min-h-[320px] overflow-hidden rounded-b-[14px] bg-[#0a1424] lg:h-[560px]">
            {campus.data ? (
              <ErrorBoundary
                fallback={(error) => (
                  <div className="absolute inset-0 grid place-items-center">
                    <ErrorState error={error} title="No se pudo cargar el gemelo 3D" />
                  </div>
                )}
              >
                <Suspense fallback={<TwinSkeleton />}>
                  <CampusTwin
                    className="absolute inset-0 h-full w-full"
                    campus={campus.data}
                    live={live.data}
                    layer={layer}
                    selectedSpaceId={selected}
                    onSelectSpace={setSelected}
                    exploded={exploded}
                    isolatedLevel={isolated}
                    onSelectLevel={setIsolated}
                    dataMode={dataMode}
                    night={night}
                    cameraPreset={view.preset}
                    onPresetChange={(id) => manual({ type: "preset", id })}
                    onUserInteract={() => {
                      if (tourActive) tour.stop();
                      setFocusOrbitUntil(0);
                    }}
                    cinematic={fpsLevel === null && (tour.state.status === "playing" || focusOrbit)}
                    firstPersonLevel={fpsLevel}
                    onFirstPersonLevel={setFpsLevel}
                    onExitFirstPerson={() => setFpsLevel(null)}
                    onModelState={setModelState}
                    viewResetToken={resetToken}
                    {...(focusSpaceIds ? { focusSpaceIds } : {})}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : campus.error ? (
              <div className="absolute inset-0 grid place-items-center">
                <ErrorState error={campus.error} onRetry={campus.reload} title="No se pudo cargar el campus" />
              </div>
            ) : (
              <TwinSkeleton />
            )}

            {flow ? (
              <div className="pointer-events-auto absolute left-2 right-2 top-12 z-20 flex justify-center sm:top-14">
                <FlowStrip steps={flow} reduced={reducedMotion} />
              </div>
            ) : null}
            {tour.step ? <div className="hidden sm:block">{renderTourBar("absolute bottom-12 left-1/2 z-20 w-[min(36rem,calc(100%-1rem))] -translate-x-1/2")}</div> : null}

            {selectedSpace && !tourActive ? (
              <SpacePanel
                space={selectedSpace}
                live={liveBySpace.get(selectedSpace.id)}
                onClose={() => setSelected(null)}
                className="absolute inset-x-2 bottom-2 z-10 max-h-[70%] overflow-auto sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-auto sm:w-72"
              />
            ) : null}
          </div>
          {tour.step ? <div className="border-t border-line p-2 sm:hidden">{renderTourBar("")}</div> : null}
          <p className="border-t border-line px-3 py-2 text-[11px] text-ink-2">
            Datos simulados. La geometría es provisional y no representa planos oficiales del edificio.
            {focusSpaceIds?.length ? ` Enfocando ${focusSpaceIds.length} espacio(s) indicados por el asistente.` : ""}
          </p>
        </Panel>

        <div className="flex flex-col gap-4 self-start">
        {isAdmin && campus.data ? (
          <DemoPanel spaces={campus.data.spaces} onFocus={onDemoFocus} suggestedSpaceId={selected} onSteps={setFlow} />
        ) : null}
        {/* Alertas */}
        <Panel title="Alertas activas" icon={<Flame size={16} aria-hidden="true" />} className="self-start" bodyClassName="p-2">
          {incidents.loading && !incidents.data ? (
            <div className="p-2">
              <SkeletonRows rows={4} className="h-14" />
            </div>
          ) : incidents.error && !incidents.data ? (
            <ErrorState error={incidents.error} onRetry={incidents.reload} title="No se pudieron cargar las alertas" />
          ) : incidents.data && incidents.data.length > 0 ? (
            <ul className="m-0 flex max-h-[640px] list-none flex-col gap-1.5 overflow-auto p-0">
              {incidents.data.map((i) => {
                const sp = spaces.get(i.space_id);
                const st = liveBySpace.get(i.space_id)?.status;
                return (
                  <li key={i.id}>
                    <Link
                      to={`/incidentes/${encodeURIComponent(i.id)}`}
                      className="panel-flat block px-3 py-2.5 text-ink no-underline transition-colors hover:border-link"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <SeverityBadge severity={i.severity} size="sm" />
                        <span className="num text-[11px] text-ink-2">{fmtAgo(i.opened_at)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium leading-snug">{i.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                        <Activity size={12} aria-hidden="true" />
                        {sp?.name ?? i.space_id}
                        {st ? <StatusBadge status={st} size="sm" /> : null}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Sin alertas activas" hint="No hay incidencias abiertas, pendientes ni reconocidas." />
          )}
        </Panel>
        </div>
      </div>
    </div>
  );
}
