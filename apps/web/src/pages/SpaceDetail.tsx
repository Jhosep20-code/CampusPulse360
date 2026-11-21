import { STATUS_THRESHOLDS } from "@campuspulse/contracts";
import { ArrowLeft, ChevronRight, Info, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useLiveCtx, useSpaceIndex } from "../app/context";
import { SeriesChart, type SeriesRow } from "../components/SeriesChart";
import { typeLabel } from "../components/SpacePanel";
import { IncidentStatusBadge, SeverityBadge, StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api } from "../lib/api";
import { fmtAgo, fmtDec, fmtInt } from "../lib/format";

const SIX_HOURS = 6 * 3600_000;

function summarize(rows: SeriesRow[], key: string, unit: string): string {
  const v = rows.map((r) => r[key]).filter((x): x is number => typeof x === "number");
  if (v.length === 0) return "Sin datos en el periodo.";
  return `${v.length} puntos; mínimo ${Math.min(...v).toFixed(1)} ${unit}, máximo ${Math.max(...v).toFixed(1)} ${unit}, último ${(v[v.length - 1] ?? 0).toFixed(1)} ${unit}.`;
}

export default function SpaceDetail() {
  const { id = "" } = useParams();
  const spaces = useSpaceIndex();
  const live = useLiveCtx();
  const space = spaces.get(id);
  const liveSpace = live.data?.spaces.find((s) => s.space_id === id);

  const readings = useResource(
    (signal) => {
      const to = Date.now();
      return api.readings(id, to - SIX_HOURS, to, 300, signal);
    },
    [id],
  );
  const forecast = useResource((signal) => api.forecast(id, "co2_ppm", signal), [id]);
  const incidents = useResource(async (signal) => (await api.incidents({ space_id: id, limit: 20 }, signal)).items, [id]);

  const rows = useMemo<SeriesRow[]>(
    () => (readings.data?.points ?? []).map((p) => ({ ts: p.ts, co2: p.co2_ppm, temp: p.temp_c, occ: p.occupancy, power: p.power_w })),
    [readings.data],
  );

  const co2Rows = useMemo<SeriesRow[]>(() => {
    const base: SeriesRow[] = rows.map((r) => ({ ts: r.ts, co2: r.co2 }));
    const f = forecast.data?.forecast ?? [];
    if (f.length === 0) return base;
    const last = base[base.length - 1];
    if (last && typeof last.co2 === "number") last.forecast = last.co2; // une ambas lineas
    return [...base, ...f.map((p) => ({ ts: p.ts, forecast: p.value }))];
  }, [rows, forecast.data]);

  const m = liveSpace?.metrics ?? null;

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft size={15} aria-hidden="true" /> Centro de mando
      </Link>
      <PageHeader
        title={space ? space.name : `Espacio ${id}`}
        subtitle={space ? `${space.code} · ${typeLabel(space.type)} · Piso ${space.level} · aforo ${space.capacity}` : "Espacio no encontrado en el campus cargado."}
        actions={
          <>
            {liveSpace ? <StatusBadge status={liveSpace.status} /> : null}
            <button type="button" className="btn btn-sm" onClick={() => { readings.reload(); forecast.reload(); incidents.reload(); }}>
              <RefreshCw size={14} aria-hidden="true" /> Actualizar
            </button>
          </>
        }
      />

      {m ? (
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["CO₂", fmtInt(m.co2_ppm), "ppm"],
            ["Temperatura", fmtDec(m.temp_c), "°C"],
            ["Humedad", fmtInt(m.rh_pct), "%"],
            ["Ocupación", `${fmtInt(m.occupancy)}${space ? ` / ${fmtInt(space.capacity)}` : ""}`, "pers."],
            ["Potencia", fmtInt(m.power_w), "W"],
          ].map(([l, v, u]) => (
            <div key={l} className="panel px-3.5 py-2.5">
              <dt className="text-xs text-ink-2">{l}</dt>
              <dd className="num m-0 text-xl">
                {v} <span className="text-xs text-ink-2">{u}</span>
              </dd>
            </div>
          ))}
          <p className="num col-span-full m-0 text-[11px] text-ink-2">
            Último dato {fmtAgo(liveSpace?.last_ts)} · fuente {liveSpace?.source ?? "—"} (telemetría simulada)
          </p>
        </dl>
      ) : null}

      {readings.loading && !readings.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : readings.error && !readings.data ? (
        <Panel>
          <ErrorState error={readings.error} onRetry={readings.reload} title="No se pudieron cargar las series" />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState title="Sin lecturas en las últimas 6 horas" hint="El simulador aún no ha enviado datos para este espacio." />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="CO₂ y pronóstico a 30 min"
            className="lg:col-span-2"
            actions={<span className="text-[11px] text-ink-2">últimas 6 h</span>}
          >
            <SeriesChart
              title="Concentración de CO₂"
              unit="ppm"
              rows={co2Rows}
              series={[
                { key: "co2", label: "Medición simulada", color: "#22D3D6" },
                ...(forecast.data && forecast.data.forecast.length > 0 ? [{ key: "forecast", label: "Pronóstico (Holt)", color: "#F0B95B", dashed: true }] : []),
              ]}
              refLines={[
                { y: STATUS_THRESHOLDS.co2_ppm.warning, label: "Advertencia", color: "#F0B95B" },
                { y: STATUS_THRESHOLDS.co2_ppm.critical, label: "Crítico", color: "#FF5C7A" },
              ]}
              summary={summarize(rows, "co2", "ppm")}
              height={250}
            />
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-ink-2" role="note">
              <Info size={14} className="mt-0.5 shrink-0 text-link" aria-hidden="true" />
              <p className="m-0">
                {forecast.loading && !forecast.data ? (
                  "Calculando pronóstico…"
                ) : forecast.data ? (
                  <>
                    Pronóstico a {forecast.data.horizon_min} min (método {forecast.data.method}). MAE del backtest:{" "}
                    <strong className="num text-ink">{forecast.data.mae === null ? "no disponible (datos insuficientes)" : `${forecast.data.mae.toFixed(1)} ppm`}</strong>.{" "}
                    Calculado sobre datos simulados.
                  </>
                ) : (
                  <>Pronóstico no disponible ({forecast.error?.message ?? "sin datos"}). Calculado sobre datos simulados.</>
                )}
              </p>
            </div>
          </Panel>

          <Panel title="Temperatura">
            <SeriesChart
              title="Temperatura"
              unit="°C"
              rows={rows}
              series={[{ key: "temp", label: "°C", color: "#F0B95B" }]}
              refLines={[{ y: STATUS_THRESHOLDS.temp_c.warning, label: "Advertencia", color: "#F0B95B" }]}
              summary={summarize(rows, "temp", "°C")}
            />
          </Panel>
          <Panel title="Ocupación">
            <SeriesChart
              title="Ocupación"
              unit="personas"
              rows={rows}
              series={[{ key: "occ", label: "Personas", color: "#7C9BFF" }]}
              refLines={space ? [{ y: space.capacity, label: "Aforo", color: "#93A3BC" }] : []}
              summary={summarize(rows, "occ", "personas")}
            />
          </Panel>
          <Panel title="Potencia" className="lg:col-span-2">
            <SeriesChart
              title="Potencia eléctrica"
              unit="W"
              rows={rows}
              series={[{ key: "power", label: "W", color: "#A78BFA" }]}
              summary={summarize(rows, "power", "W")}
              height={190}
            />
          </Panel>
        </div>
      )}

      <Panel title="Incidencias del espacio" className="mt-4" bodyClassName="p-2">
        {incidents.loading && !incidents.data ? (
          <Skeleton className="m-2 h-14" />
        ) : incidents.error && !incidents.data ? (
          <ErrorState error={incidents.error} onRetry={incidents.reload} title="No se pudieron cargar las incidencias" />
        ) : incidents.data && incidents.data.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {incidents.data.map((i) => (
              <li key={i.id}>
                <Link to={`/incidentes/${encodeURIComponent(i.id)}`} className="panel-flat flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-ink no-underline hover:border-link">
                  <span className="text-sm font-medium">{i.title}</span>
                  <span className="flex items-center gap-2">
                    <SeverityBadge severity={i.severity} size="sm" />
                    <IncidentStatusBadge status={i.status} size="sm" />
                    <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin incidencias en este espacio" />
        )}
      </Panel>
    </div>
  );
}
