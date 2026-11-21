import type { IncidentEvent } from "@campuspulse/contracts";
import {
  ArrowLeft,
  BellRing,
  Bot,
  CircleCheck,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Siren,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useRole, useSpaceIndex } from "../app/context";
import { DiagnosisCard } from "../components/DiagnosisCard";
import { IncidentStatusBadge, SeverityBadge } from "../components/StatusBadge";
import { ErrorState, Notice, PageHeader, Panel, SkeletonRows } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api } from "../lib/api";
import { fmtDateTime } from "../lib/format";

const EVENT_META: Record<IncidentEvent["kind"], { label: string; Icon: LucideIcon }> = {
  opened: { label: "Incidencia abierta", Icon: Siren },
  diagnosed: { label: "Diagnóstico generado", Icon: Sparkles },
  notified: { label: "Notificación enviada", Icon: BellRing },
  acknowledged: { label: "Reconocida", Icon: ShieldCheck },
  resolved: { label: "Resuelta", Icon: CircleCheck },
  comment: { label: "Comentario", Icon: MessageSquare },
};

export default function IncidentDetail() {
  const { id = "" } = useParams();
  const spaces = useSpaceIndex();
  const { canOperate } = useRole();
  const res = useResource((signal) => api.incident(id, signal), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function act(name: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      res.reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo completar la acción" });
    } finally {
      setBusy(null);
    }
  }

  if (res.loading && !res.data) {
    return (
      <div>
        <PageHeader title="Incidencia" />
        <SkeletonRows rows={3} className="h-40" />
      </div>
    );
  }
  if (!res.data) {
    return (
      <div>
        <PageHeader title="Incidencia" />
        <Panel>
          <ErrorState error={res.error} onRetry={res.reload} title="No se pudo cargar la incidencia" />
        </Panel>
      </div>
    );
  }

  const { incident, events } = res.data;
  const space = spaces.get(incident.space_id);
  const timeline = [...events].sort((a, b) => a.ts - b.ts);
  const closed = incident.status === "resolved";

  return (
    <div>
      <Link to="/incidentes" className="mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft size={15} aria-hidden="true" /> Incidencias
      </Link>
      <PageHeader
        title={incident.title}
        subtitle={
          <>
            <Link to={`/espacios/${encodeURIComponent(incident.space_id)}`}>{space?.name ?? incident.space_id}</Link> · abierta el{" "}
            {fmtDateTime(incident.opened_at)}
            {incident.closed_at ? ` · cerrada el ${fmtDateTime(incident.closed_at)}` : ""}
          </>
        }
        actions={
          <>
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Acciones de la incidencia" role="group">
        {canOperate ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy !== null || closed || incident.status === "acknowledged"}
              onClick={() => act("ack", () => api.patchIncident(id, { status: "acknowledged" }), "Incidencia reconocida.")}
            >
              <ShieldCheck size={16} aria-hidden="true" /> Reconocer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null || closed}
              onClick={() => act("res", () => api.patchIncident(id, { status: "resolved" }), "Incidencia resuelta.")}
            >
              <CircleCheck size={16} aria-hidden="true" /> Resolver
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => act("dx", () => api.rediagnose(id), "Diagnóstico solicitado de nuevo.")}
            >
              <RefreshCw size={16} className={busy === "dx" ? "animate-spin" : ""} aria-hidden="true" /> Re-diagnosticar
            </button>
          </>
        ) : (
          <p className="text-sm text-ink-2">
            Las acciones (reconocer, resolver, re-diagnosticar) requieren rol de operador. <Link to="/acceso">Iniciar sesión</Link>.
          </p>
        )}
      </div>
      {msg ? (
        <div className="mb-4">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DiagnosisCard diagnosis={incident.diagnosis} meta={incident.diagnosis_meta} pending={incident.status === "pending_ai"} />

        <Panel title="Línea de tiempo" icon={<Bot size={16} aria-hidden="true" />} className="self-start">
          {timeline.length === 0 ? (
            <p className="text-sm text-ink-2">Sin eventos registrados.</p>
          ) : (
            <ol className="m-0 list-none space-y-0 p-0">
              {timeline.map((e, idx) => {
                const m = EVENT_META[e.kind];
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < timeline.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden="true" /> : null}
                    <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ok">
                      <m.Icon size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="num text-[11px] text-ink-2">
                        {fmtDateTime(e.ts)} · {e.actor}
                      </p>
                      {e.detail ? <p className="mt-0.5 text-sm text-ink-2">{e.detail}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
