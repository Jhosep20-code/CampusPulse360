import { Cpu, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Link } from "react-router";
import { useCampusCtx, useLiveCtx } from "../app/context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonRows } from "../components/ui";
import { fmtAgo, fmtDateTime, fmtDec, fmtInt } from "../lib/format";

const SAMPLE = `POST /api/v1/ingest
X-Gateway-Id: gw-sim-01
X-Timestamp: <epoch ms>
X-Signature: hex(HMAC-SHA256(clave_gateway, "<X-Timestamp>.<cuerpo_crudo>"))

{ "gateway_id": "gw-sim-01", "source": "sim",
  "readings": [{ "device_id": "...", "ts": 1700000000000,
                 "co2_ppm": 640, "temp_c": 23.1, "rh_pct": 48,
                 "occupancy": 12, "power_w": 820 }] }`;

const SOURCE_LABEL: Record<string, string> = {
  sim: "sim · simulador IoT",
  "sim-scenario": "sim-scenario · escenario de demo",
  device: "device · sensor físico",
};

export default function Iot() {
  const campus = useCampusCtx();
  const live = useLiveCtx();
  const liveBySpace = new Map((live.data?.spaces ?? []).map((s) => [s.space_id, s]));
  const spaces = campus.data?.spaces ?? [];

  return (
    <div>
      <PageHeader
        title="IoT y telemetría"
        subtitle="Último dato por espacio. Toda la telemetría es simulada: no hay sensores físicos conectados."
      />

      <Panel title="Dispositivos y espacios" icon={<Cpu size={16} aria-hidden="true" />} bodyClassName="p-0">
        {campus.loading && !campus.data ? (
          <div className="p-4">
            <SkeletonRows rows={6} className="h-10" />
          </div>
        ) : campus.error && !campus.data ? (
          <ErrorState error={campus.error} onRetry={campus.reload} title="No se pudo cargar el campus" />
        ) : spaces.length === 0 ? (
          <EmptyState title="Sin espacios registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-left text-sm">
              <caption className="sr-only">Espacios con su último dato, conexión y fuente</caption>
              <thead>
                <tr className="border-b border-line text-xs text-ink-2">
                  <th scope="col" className="px-4 py-2.5 font-medium">Espacio</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Conexión</th>
                  <th scope="col" className="hidden px-2 py-2.5 font-medium md:table-cell">Último dato</th>
                  <th scope="col" className="hidden px-2 py-2.5 font-medium lg:table-cell">Fuente</th>
                  <th scope="col" className="num hidden px-2 py-2.5 text-right font-medium sm:table-cell">CO₂</th>
                  <th scope="col" className="num hidden px-2 py-2.5 text-right font-medium sm:table-cell">°C</th>
                  <th scope="col" className="num hidden px-2 py-2.5 text-right font-medium xl:table-cell">Ocup.</th>
                  <th scope="col" className="num hidden px-4 py-2.5 text-right font-medium xl:table-cell">W</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((sp) => {
                  const l = liveBySpace.get(sp.id);
                  const online = l ? l.status !== "offline" : false;
                  return (
                    <tr key={sp.id} className="border-b border-line/60 last:border-0 hover:bg-panel-2/60">
                      <td className="px-4 py-2.5">
                        <Link to={`/espacios/${encodeURIComponent(sp.id)}`} className="font-medium">
                          {sp.name}
                        </Link>
                        <div className="num text-[11px] text-ink-2">
                          {sp.code} · piso {sp.level}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={l?.status ?? "offline"} size="sm" />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${online ? "text-ok" : "text-ink-2"}`}>
                          {online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
                          {online ? "En línea" : "Fuera de línea"}
                        </span>
                      </td>
                      <td className="num hidden px-2 py-2.5 text-xs text-ink-2 md:table-cell" title={fmtDateTime(l?.last_ts)}>
                        {fmtAgo(l?.last_ts)}
                      </td>
                      <td className="num hidden px-2 py-2.5 text-xs lg:table-cell">{l?.source ? (SOURCE_LABEL[l.source] ?? l.source) : "—"}</td>
                      <td className="num hidden px-2 py-2.5 text-right sm:table-cell">{fmtInt(l?.metrics?.co2_ppm)}</td>
                      <td className="num hidden px-2 py-2.5 text-right sm:table-cell">{fmtDec(l?.metrics?.temp_c)}</td>
                      <td className="num hidden px-2 py-2.5 text-right xl:table-cell">
                        {l?.metrics ? `${fmtInt(l.metrics.occupancy)}/${fmtInt(sp.capacity)}` : "—"}
                      </td>
                      <td className="num hidden px-4 py-2.5 text-right xl:table-cell">{fmtInt(l?.metrics?.power_w)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Protocolo de ingesta" icon={<ShieldCheck size={16} aria-hidden="true" />} className="mt-4">
        <p className="m-0 mb-3 inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-2.5 py-1.5 text-sm font-medium text-gold">
          Compatible con sensores físicos; actualmente simulado.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm text-ink-2">
            <p className="m-0">
              Los gateways envían lotes de lecturas a <code className="num text-ink">POST /api/v1/ingest</code>. Cada petición se
              firma con <strong className="text-ink">HMAC-SHA256</strong> usando la clave del gateway sobre{" "}
              <code className="num text-ink">{"{timestamp}.{cuerpo}"}</code>.
            </p>
            <ul className="m-0 list-disc space-y-1 pl-5">
              <li>Cabeceras: X-Gateway-Id, X-Timestamp y X-Signature.</li>
              <li>Ventana anti-replay de ±60 s respecto al reloj del servidor.</li>
              <li>Hasta 120 lecturas por lote; cada una indica el dispositivo y la marca de tiempo.</li>
              <li>Origen declarado: sim (simulador), sim-scenario (demostración) o device (sensor físico, aún sin uso).</li>
            </ul>
            <p className="m-0">
              La tabla muestra un registro por espacio: el último dato agregado de sus dispositivos simulados.
            </p>
          </div>
          <pre className="num m-0 overflow-x-auto rounded-xl border border-line bg-[#0a1424] p-3 text-[12px] leading-relaxed text-ink">{SAMPLE}</pre>
        </div>
      </Panel>
    </div>
  );
}
