import {
  Activity,
  BellRing,
  Box,
  Eye,
  Flame,
  Layers,
  Moon,
  RotateCcw,
  Thermometer,
  Users,
  Wind,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useMemo, useReducer, useState } from "react";
import { INITIAL_VIEW, reduceView } from "../twin/view-state";
import { Link, useLocation } from "react-router";
import { TWIN_LEVELS } from "../twin/constants";
import type { TwinLayer } from "../twin/types";
import { useCampusCtx, useLiveCtx, useSpaceIndex } from "../app/context";
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
  const setIsolated = (level: number | null) => dispatchView({ type: "isolate", level });
  const resetView = () => {
    dispatchView({ type: "reset" });
    setResetToken((n) => n + 1);
  };
  const [selected, setSelected] = useState<string | null>(null);

  const k = live.data?.kpis;
  const incidents = useActiveIncidents(k?.open_incidents);
  const liveBySpace = useMemo(() => new Map((live.data?.spaces ?? []).map((s) => [s.space_id, s])), [live.data]);
  const selectedSpace = selected ? spaces.get(selected) : undefined;
  // P1-P10 (P6-P10 existen en el modelo aunque no tengan espacios instrumentados).
  const levels = TWIN_LEVELS;

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
              <button type="button" className="btn btn-sm" aria-pressed={exploded} onClick={() => dispatchView({ type: "explode", on: !exploded })}>
                <Layers size={14} aria-hidden="true" /> Pisos explotados
              </button>
              <label className="sr-only" htmlFor="aislar-piso">
                Aislar piso
              </label>
              <select
                id="aislar-piso"
                className="field !min-h-[34px] !w-auto !py-0 text-[13px]"
                value={isolated === null ? "all" : String(isolated)}
                onChange={(e) => setIsolated(e.target.value === "all" ? null : Number(e.target.value))}
              >
                <option value="all">Todos los pisos</option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    Aislar piso P{l}{campus.data?.spaces.some((s) => s.level === l) ? "" : " (sin espacios)"}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" aria-pressed={dataMode} onClick={() => dispatchView({ type: "data", on: !dataMode })}>
                <Eye size={14} aria-hidden="true" /> Modo datos
              </button>
              <button type="button" className="btn btn-sm" aria-pressed={night} onClick={() => dispatchView({ type: "night", on: !night })}>
                <Moon size={14} aria-hidden="true" /> Modo noche
              </button>
              <button type="button" className="btn btn-sm" onClick={resetView} title="Quita aislamiento, explosión, corte y modo datos, y vuelve a la cámara inicial">
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
                    onPresetChange={(id) => dispatchView({ type: "preset", id })}
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

            {selectedSpace ? (
              <SpacePanel
                space={selectedSpace}
                live={liveBySpace.get(selectedSpace.id)}
                onClose={() => setSelected(null)}
                className="absolute inset-x-2 bottom-2 z-10 max-h-[70%] overflow-auto sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-auto sm:w-72"
              />
            ) : null}
          </div>
          <p className="border-t border-line px-3 py-2 text-[11px] text-ink-2">
            Datos simulados. La geometría es provisional y no representa planos oficiales del edificio.
            {focusSpaceIds?.length ? ` Enfocando ${focusSpaceIds.length} espacio(s) indicados por el asistente.` : ""}
          </p>
        </Panel>

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
  );
}
