import type { AiDiagnosis, AiOutputMeta } from "@campuspulse/contracts";
import { Bot, Cpu, FileCog, Hourglass, Sparkles } from "lucide-react";
import { fmtDateTime, fmtPct } from "../lib/format";
import { METRIC_LABEL } from "../lib/status";
import { SeverityBadge } from "./StatusBadge";
import { Meter, Panel } from "./ui";

/** Etiqueta visible segun el modo de generacion del diagnostico. */
export function diagnosisLabel(meta: AiOutputMeta): string {
  // El proveedor mock (pruebas/CI) es determinista: nunca se presenta como IA real.
  if (meta.provider === "mock") return "IA simulada (mock de pruebas) — sin inferencia real";
  if (meta.mode === "fallback") return "Diagnóstico por reglas — sin IA";
  // Siempre con fecha y modelo: un diagnostico guardado no se muestra como "en vivo".
  return `Inferencia de IA · ${meta.model} · generado el ${fmtDateTime(meta.created_at)}`;
}

export function DiagnosisCard({
  diagnosis,
  meta,
  pending = false,
}: {
  diagnosis: AiDiagnosis | null;
  meta: AiOutputMeta | null;
  pending?: boolean;
}) {
  if (!diagnosis || !meta) {
    return (
      <Panel title="Diagnóstico" icon={<Bot size={16} aria-hidden="true" />}>
        <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
          <Hourglass size={16} aria-hidden="true" />
          {pending ? "El diagnóstico está pendiente de generación." : "Esta incidencia aún no tiene diagnóstico."}
        </p>
      </Panel>
    );
  }
  const ModeIcon = meta.mode === "fallback" ? FileCog : Sparkles;
  const modeCls =
    meta.mode === "fallback"
      ? "border-warn/40 bg-warn/10 text-warn"
      : meta.mode === "cached"
        ? "border-brand/50 bg-brand/15 text-link"
        : "border-ok/40 bg-ok/10 text-ok";

  return (
    <Panel title="Diagnóstico" icon={<Bot size={16} aria-hidden="true" />} actions={<SeverityBadge severity={diagnosis.severidad} size="sm" />}>
      <div className="space-y-4">
        <p
          data-testid="diagnosis-mode"
          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${modeCls}`}
        >
          <ModeIcon size={14} aria-hidden="true" />
          <span>{diagnosisLabel(meta)}</span>
        </p>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">Causa probable</h3>
          <p className="text-sm text-ink">{diagnosis.causa_probable}</p>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">Acciones recomendadas</h3>
          <ol className="m-0 list-decimal space-y-1 pl-5 text-sm text-ink marker:text-ok">
            {diagnosis.acciones.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </section>

        {diagnosis.evidencia.length > 0 ? (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">Evidencia</h3>
            <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
              {diagnosis.evidencia.map((e, i) => (
                <li key={i} className="panel-flat flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                  <span className="truncate text-ink-2">
                    <Cpu size={12} className="mr-1 inline" aria-hidden="true" />
                    {e.device_id} · {METRIC_LABEL[e.metric].label}
                  </span>
                  <span className="num text-ink">
                    {e.valor} {METRIC_LABEL[e.metric].unit}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <div className="mb-1 flex items-center justify-between text-xs">
            <h3 className="font-semibold uppercase tracking-wide text-ink-2">Confianza</h3>
            <span className="num text-ink">{fmtPct(diagnosis.confianza)}</span>
          </div>
          <Meter value={diagnosis.confianza} max={1} label="Confianza del diagnóstico" warnAt={2} critAt={2} />
        </section>

        <dl className="num grid grid-cols-1 gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-2 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt>Proveedor:</dt>
            <dd className="m-0 text-ink">{meta.provider}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Modelo:</dt>
            <dd className="m-0 truncate text-ink">{meta.model}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Generado:</dt>
            <dd className="m-0 text-ink">{fmtDateTime(meta.created_at)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Latencia:</dt>
            <dd className="m-0 text-ink">{meta.latency_ms === null ? "—" : `${meta.latency_ms} ms`}</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}
