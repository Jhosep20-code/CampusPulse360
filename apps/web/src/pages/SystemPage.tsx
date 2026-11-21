import { Brain, CircleCheck, Database, GitCommit, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { ErrorState, Meter, PageHeader, Panel, SkeletonRows } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { api } from "../lib/api";
import { fmtInt } from "../lib/format";

/** Presupuesto diario de Workers AI en el plan gratuito (neuronas). */
const FREE_NEURONS_PER_DAY = 10_000;

const AI_HEALTH = {
  available: { label: "IA disponible", Icon: CircleCheck, cls: "text-ok" },
  fallback: { label: "Modo respaldo (sin IA)", Icon: TriangleAlert, cls: "text-warn" },
  unknown: { label: "IA sin comprobar", Icon: Info, cls: "text-ink-2" },
} as const;

export default function SystemPage() {
  const sys = useResource((s) => api.system(s), []);
  const health = useResource((s) => api.health(s), []);

  const ai = sys.data?.ai;
  const dbOk = health.data?.checks.db;
  const aiState = health.data ? AI_HEALTH[health.data.checks.ai] : null;

  return (
    <div>
      <PageHeader title="Sistema" subtitle="Versión desplegada, salud de los servicios y consumo de IA del día." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Despliegue" icon={<GitCommit size={16} aria-hidden="true" />}>
          {sys.loading && !sys.data ? (
            <SkeletonRows rows={4} className="h-6" />
          ) : sys.error && !sys.data ? (
            <ErrorState error={sys.error} onRetry={sys.reload} title="No se pudo leer el sistema" />
          ) : sys.data ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-2">Aplicación</dt>
              <dd className="m-0">{sys.data.name}</dd>
              <dt className="text-ink-2">Versión</dt>
              <dd className="num m-0">{sys.data.version}</dd>
              <dt className="text-ink-2">Commit</dt>
              <dd className="num m-0 break-all">{sys.data.commit}</dd>
              <dt className="text-ink-2">Entorno</dt>
              <dd className="num m-0">{sys.data.environment}</dd>
              <dt className="text-ink-2">Telemetría</dt>
              <dd className="m-0">{sys.data.telemetry_simulated ? "Simulada (sin sensores físicos)" : "Incluye sensores físicos"}</dd>
            </dl>
          ) : null}
        </Panel>

        <Panel title="Salud de servicios" icon={<Database size={16} aria-hidden="true" />}>
          {health.loading && !health.data ? (
            <SkeletonRows rows={3} className="h-6" />
          ) : health.error && !health.data ? (
            <ErrorState error={health.error} onRetry={health.reload} title="No se pudo leer la salud" />
          ) : health.data ? (
            <ul className="m-0 list-none space-y-2.5 p-0 text-sm">
              <li className={`flex items-center gap-2 ${health.data.status === "ok" ? "text-ok" : "text-warn"}`}>
                {health.data.status === "ok" ? <CircleCheck size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />}
                Estado general: {health.data.status === "ok" ? "operativo" : "degradado"}
              </li>
              <li className={`flex items-center gap-2 ${dbOk ? "text-ok" : "text-crit"}`}>
                {dbOk ? <CircleCheck size={16} aria-hidden="true" /> : <OctagonAlert size={16} aria-hidden="true" />}
                Base de datos D1: {dbOk ? "responde" : "sin respuesta"}
              </li>
              {aiState ? (
                <li className={`flex items-center gap-2 ${aiState.cls}`}>
                  <aiState.Icon size={16} aria-hidden="true" />
                  {aiState.label}
                </li>
              ) : null}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Uso de IA hoy" icon={<Brain size={16} aria-hidden="true" />} className="lg:col-span-2">
          {sys.loading && !sys.data ? (
            <SkeletonRows rows={2} className="h-8" />
          ) : ai ? (
            <div className="space-y-5">
              <p className="num m-0 text-sm text-ink-2">
                Proveedor <span className="text-ink">{ai.provider}</span> · modelo <span className="text-ink">{ai.model}</span>
              </p>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Llamadas sobre el límite diario</span>
                  <span className="num text-ink">
                    {fmtInt(ai.calls_today)} / {fmtInt(ai.daily_limit)}
                  </span>
                </div>
                <Meter value={ai.calls_today} max={ai.daily_limit} label="Llamadas de IA hoy sobre el límite diario" />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Neuronas estimadas</span>
                  <span className="num text-ink">
                    {fmtInt(ai.est_neurons_today)} / {fmtInt(FREE_NEURONS_PER_DAY)}
                  </span>
                </div>
                <Meter value={ai.est_neurons_today} max={FREE_NEURONS_PER_DAY} label="Neuronas estimadas hoy sobre el presupuesto gratuito" />
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-ink-2">Sin datos de uso disponibles.</p>
          )}
          <p className="m-0 mt-5 flex items-start gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-ink-2" role="note">
            <Info size={14} className="mt-0.5 shrink-0 text-link" aria-hidden="true" />
            <span>
              El proyecto opera con costo adicional S/ 0.00 sobre planes gratuitos: Workers AI incluye unas {fmtInt(FREE_NEURONS_PER_DAY)} neuronas
              diarias y se aplica un límite propio de llamadas. Al superarlo, el sistema responde con reglas deterministas (sin IA). La
              neurona estimada es una aproximación, no una factura. Toda la telemetría es simulada.
            </span>
          </p>
        </Panel>
      </div>
    </div>
  );
}
