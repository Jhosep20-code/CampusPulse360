import type { ScenarioName } from "@campuspulse/contracts";
import { Bot, FileText, FlaskConical, Printer, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRole } from "../app/context";
import { SeverityBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, Notice, PageHeader, Panel, SkeletonRows } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api, type ReportMeta } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { SPACE_STATUS } from "../lib/status";

const BOT_LABEL = { "incident-bot": "Bot de incidencias", "report-bot": "Bot de reportes", "ui-rpa-bot": "Bot RPA de interfaz" } as const;
const RUN_STATUS = {
  running: { label: "En ejecución", s: "warning" },
  success: { label: "Correcta", s: "ok" },
  partial: { label: "Parcial", s: "warning" },
  failed: { label: "Fallida", s: "critical" },
} as const;

const SCENARIOS: Array<{ name: ScenarioName; label: string; hint: string }> = [
  { name: "aula-saturada", label: "aula-saturada", hint: "Sube la ocupación y el CO₂ de un aula." },
  { name: "falla-climatizacion", label: "falla-climatizacion", hint: "Eleva la temperatura por falla de climatización." },
  { name: "normalizar", label: "normalizar", hint: "Devuelve la telemetría a valores normales." },
];

/* ----------------------------------------------------------------- reportes */

function ReportViewer({ id }: { id: string }) {
  const res = useResource((s) => api.report(id, s), [id]);
  const frame = useRef<HTMLIFrameElement>(null);

  if (res.loading && !res.data) return <SkeletonRows rows={2} className="h-24" />;
  if (!res.data) return <ErrorState error={res.error} onRetry={res.reload} title="No se pudo cargar el reporte" />;
  const { html, title } = res.data;
  if (!html) return <EmptyState title="Este reporte no incluye vista HTML" hint="El servidor aún no entregó el contenido imprimible." />;

  return (
    <div className="space-y-2">
      <div className="no-print flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        <button type="button" className="btn btn-sm" onClick={() => frame.current?.contentWindow?.print()}>
          <Printer size={14} aria-hidden="true" /> Imprimir
        </button>
      </div>
      {/* sandbox sin scripts: el HTML del reporte no puede ejecutar codigo. */}
      <iframe
        ref={frame}
        title={`Reporte: ${title}`}
        sandbox="allow-same-origin allow-modals"
        srcDoc={html}
        className="h-[480px] w-full rounded-xl border border-line bg-white"
      />
    </div>
  );
}

/* ----------------------------------------------------------------- pagina */

export default function Automations() {
  const { isAdmin } = useRole();
  const rules = useResource((s) => api.rules(s), []);
  const runs = useResource((s) => api.botRuns(s), []);
  const reports = useResource((s) => api.reports(s), []);
  const [selReport, setSelReport] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
      after?.();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo completar la acción" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Automatizaciones" subtitle="Reglas de alerta, ejecuciones de bots (RPA) y reportes generados." />
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Reglas de alerta" icon={<Settings2 size={16} aria-hidden="true" />} bodyClassName="p-2">
          {rules.loading && !rules.data ? (
            <div className="p-2"><SkeletonRows rows={4} className="h-14" /></div>
          ) : rules.error && !rules.data ? (
            <ErrorState error={rules.error} onRetry={rules.reload} title="No se pudieron cargar las reglas" />
          ) : rules.data && rules.data.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {rules.data.map((r) => (
                <li key={r.id} className="panel-flat flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="m-0 text-sm font-medium">{r.name}</p>
                    <p className="num m-0 text-xs text-ink-2">
                      {r.metric} {r.op} {r.threshold} durante {r.sustain_s} s
                    </p>
                  </div>
                  <SeverityBadge severity={r.severity} size="sm" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={`Regla ${r.name}: ${r.enabled ? "activada" : "desactivada"}`}
                    disabled={!isAdmin || busy === `rule-${r.id}`}
                    title={isAdmin ? undefined : "Solo un administrador puede cambiar reglas"}
                    onClick={() => run(`rule-${r.id}`, () => api.setRuleEnabled(r.id, !r.enabled), `Regla "${r.name}" ${r.enabled ? "desactivada" : "activada"}.`, rules.reload)}
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      r.enabled ? "border-ok bg-ok/30" : "border-line bg-panel-2"
                    }`}
                  >
                    <span className={`absolute top-0.5 size-4.5 rounded-full transition-all ${r.enabled ? "left-[22px] bg-ok" : "left-0.5 bg-ink-2"}`} />
                  </button>
                  <span className="w-20 text-xs text-ink-2">{r.enabled ? "Activada" : "Desactivada"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sin reglas configuradas" />
          )}
          {!isAdmin ? <p className="m-0 px-3 pb-2 pt-1 text-xs text-ink-2">Solo el rol administrador puede activar o desactivar reglas.</p> : null}
        </Panel>

        <Panel title="Ejecuciones de bots" icon={<Bot size={16} aria-hidden="true" />} bodyClassName="p-2">
          {runs.loading && !runs.data ? (
            <div className="p-2"><SkeletonRows rows={4} className="h-14" /></div>
          ) : runs.error && !runs.data ? (
            <ErrorState error={runs.error} onRetry={runs.reload} title="No se pudieron cargar las ejecuciones" />
          ) : runs.data && runs.data.length > 0 ? (
            <ul className="m-0 flex max-h-96 list-none flex-col gap-1.5 overflow-auto p-0">
              {runs.data.map((r) => {
                const st = RUN_STATUS[r.status];
                const meta = SPACE_STATUS[st.s];
                return (
                  <li key={r.id} className="panel-flat px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{BOT_LABEL[r.bot]}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                        <meta.Icon size={12} aria-hidden="true" /> {st.label}
                      </span>
                    </div>
                    <p className="num m-0 text-[11px] text-ink-2">
                      {fmtDateTime(r.started_at)}
                      {r.finished_at ? ` → ${fmtDateTime(r.finished_at)}` : ""}
                    </p>
                    {r.summary ? <p className="m-0 mt-1 text-sm text-ink-2">{r.summary}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Sin ejecuciones todavía" hint="Los bots se ejecutan por cron o al activar un escenario." />
          )}
        </Panel>
      </div>

      <Panel title="Reportes" icon={<FileText size={16} aria-hidden="true" />}>
        {reports.loading && !reports.data ? (
          <SkeletonRows rows={2} className="h-12" />
        ) : reports.error && !reports.data ? (
          <ErrorState error={reports.error} onRetry={reports.reload} title="No se pudieron cargar los reportes" />
        ) : reports.data && reports.data.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Lista de reportes">
              {reports.data.map((r: ReportMeta) => (
                <li key={r.id}>
                  <button type="button" className="btn w-full !justify-between text-left" aria-pressed={selReport === r.id} onClick={() => setSelReport(r.id)}>
                    <span className="truncate">{r.title}</span>
                    <span className="num text-[11px] text-ink-2">{fmtDateTime(r.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div>{selReport ? <ReportViewer id={selReport} /> : <EmptyState title="Selecciona un reporte" hint="Se mostrará una vista imprimible." />}</div>
          </div>
        ) : (
          <EmptyState title="Sin reportes generados" hint="El bot de reportes los crea periódicamente." />
        )}
      </Panel>

      {isAdmin ? (
        <Panel title="Escenarios de demostración" icon={<FlaskConical size={16} aria-hidden="true" />}>
          <p className="m-0 mb-3 text-sm text-ink-2">
            Inyectan telemetría <strong className="text-gold">simulada</strong> para demostrar incidencias, IA y alertas. Solo administradores.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {SCENARIOS.map((s) => (
              <button
                key={s.name}
                type="button"
                className="btn !h-auto flex-col !items-start gap-0.5 !py-2.5 text-left"
                disabled={busy !== null}
                onClick={() => run(`sc-${s.name}`, () => api.scenario(s.name), `Escenario "${s.name}" aplicado.`)}
              >
                <span className="num font-medium">{s.label}</span>
                <span className="text-xs font-normal text-ink-2">{s.hint}</span>
              </button>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
