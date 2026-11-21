import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { useLiveCtx, useSpaceIndex } from "../app/context";
import { ConnectionBadge, SimBadge } from "../app/Layout";
import { SeverityBadge } from "../components/StatusBadge";
import { PulseValue } from "../components/ui";
import { useActiveIncidents } from "../hooks/useActiveIncidents";
import { fmtInt, fmtPct } from "../lib/format";
import { SPACE_STATUS } from "../lib/status";

/** Vista ultracompacta para reloj: una columna, fuente grande y alto contraste. */
export default function WatchView() {
  const live = useLiveCtx();
  const spaces = useSpaceIndex();
  const k = live.data?.kpis;
  const incidents = useActiveIncidents(k?.open_incidents);
  const top = incidents.data?.[0];
  const crit = k?.spaces_critical ?? 0;
  const occ = k && k.capacity_total > 0 ? k.occupancy_total / k.capacity_total : 0;

  const stats: Array<{ label: string; value: string; unit: string; color: string }> = [
    { label: "Críticos", value: k ? fmtInt(crit) : "—", unit: "", color: crit > 0 ? "text-crit" : "text-ok" },
    { label: "CO₂ medio", value: k?.avg_co2_ppm == null ? "—" : fmtInt(k.avg_co2_ppm), unit: "ppm", color: (k?.avg_co2_ppm ?? 0) >= 1000 ? "text-warn" : "text-white" },
    { label: "Ocupación", value: k ? fmtPct(occ) : "—", unit: "", color: "text-white" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-3 bg-black/20 px-3 py-3">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" aria-label="Volver al Centro de mando" className="inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={16} aria-hidden="true" /> Mando
        </Link>
        <SimBadge />
      </header>
      <ConnectionBadge />

      <h1 className="sr-only">Vista de reloj</h1>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Indicadores">
        {stats.map((s) => (
          <li key={s.label} className="rounded-2xl border border-line bg-panel px-4 py-2.5">
            <p className="m-0 text-base font-medium text-ink-2">{s.label}</p>
            <p className={`num m-0 text-5xl font-medium leading-tight ${s.color}`}>
              <PulseValue value={s.value} />
              {s.unit ? <span className="ml-1 text-xl text-ink-2">{s.unit}</span> : null}
            </p>
          </li>
        ))}
      </ul>

      <section aria-label="Alerta más grave" className="rounded-2xl border-2 border-line bg-panel px-4 py-3">
        <h2 className="m-0 mb-1 text-base font-medium text-ink-2">Alerta más grave</h2>
        {top ? (
          <Link to={`/incidentes/${encodeURIComponent(top.id)}`} className="block text-white no-underline">
            <SeverityBadge severity={top.severity} size="lg" />
            <p className="m-0 mt-2 text-2xl font-semibold leading-snug">{top.title}</p>
            <p className="m-0 mt-1 text-lg text-ink-2">{spaces.get(top.space_id)?.name ?? top.space_id}</p>
          </Link>
        ) : incidents.loading && !incidents.data ? (
          <p className="m-0 text-xl text-ink-2" role="status">Cargando…</p>
        ) : incidents.error ? (
          <p className="m-0 flex items-center gap-2 text-xl text-ink-2" role="alert">
            <SPACE_STATUS.offline.Icon size={22} aria-hidden="true" /> Sin datos de alertas
          </p>
        ) : (
          <p className="m-0 flex items-center gap-2 text-2xl font-semibold text-ok">
            <SPACE_STATUS.ok.Icon size={26} aria-hidden="true" /> Sin alertas
          </p>
        )}
      </section>
    </main>
  );
}
