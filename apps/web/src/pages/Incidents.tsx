import type { IncidentStatus } from "@campuspulse/contracts";
import { ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useSpaceIndex } from "../app/context";
import { IncidentStatusBadge, SeverityBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonRows } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api } from "../lib/api";
import { fmtAgo, fmtDateTime } from "../lib/format";

const FILTERS: Array<{ id: IncidentStatus | "all"; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Abiertas" },
  { id: "pending_ai", label: "Pendientes de IA" },
  { id: "acknowledged", label: "Reconocidas" },
  { id: "resolved", label: "Resueltas" },
];

export default function Incidents() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("estado");
  const filter: IncidentStatus | "all" = FILTERS.some((f) => f.id === raw) ? (raw as IncidentStatus | "all") : "all";
  const spaces = useSpaceIndex();
  const res = useResource(
    async (signal) => (await api.incidents({ status: filter === "all" ? undefined : filter, limit: 100 }, signal)).items,
    [filter],
  );

  return (
    <div>
      <PageHeader title="Incidencias" subtitle="Alertas generadas por reglas sobre telemetría simulada, con diagnóstico asistido." />
      <div role="group" aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="btn btn-sm"
            aria-pressed={filter === f.id}
            onClick={() => setParams(f.id === "all" ? {} : { estado: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Panel bodyClassName="p-2">
        {res.loading && !res.data ? (
          <div className="p-2">
            <SkeletonRows rows={5} className="h-16" />
          </div>
        ) : res.error && !res.data ? (
          <ErrorState error={res.error} onRetry={res.reload} title="No se pudieron cargar las incidencias" />
        ) : res.data && res.data.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {res.data.map((i) => (
              <li key={i.id}>
                <Link
                  to={`/incidentes/${encodeURIComponent(i.id)}`}
                  className="panel-flat flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 text-ink no-underline transition-colors hover:border-link"
                >
                  <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                    <span className="text-sm font-medium">{i.title}</span>
                    <span className="text-xs text-ink-2">
                      {spaces.get(i.space_id)?.name ?? i.space_id} · <span title={fmtDateTime(i.opened_at)}>{fmtAgo(i.opened_at)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={i.severity} size="sm" />
                    <IncidentStatusBadge status={i.status} size="sm" />
                    <ChevronRight size={16} className="text-ink-2" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin incidencias" hint="No hay incidencias con este filtro. Prueba otro estado o activa un escenario de demostración." />
        )}
      </Panel>
    </div>
  );
}
