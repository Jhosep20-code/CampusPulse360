import type { LiveSpace, Space } from "@campuspulse/contracts";
import { ArrowUpRight, X } from "lucide-react";
import { Link } from "react-router";
import { fmtAgo, fmtDec, fmtInt } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const TYPE_LABEL: Record<Space["type"], string> = {
  classroom: "Aula",
  lab: "Laboratorio",
  library: "Biblioteca",
  auditorium: "Auditorio",
  lobby: "Vestíbulo",
  office: "Oficina",
};

export function typeLabel(t: Space["type"]): string {
  return TYPE_LABEL[t];
}

/** Panel lateral con las metricas del espacio seleccionado en el gemelo. */
export function SpacePanel({
  space,
  live,
  onClose,
  className = "",
}: {
  space: Space;
  live: LiveSpace | undefined;
  onClose: () => void;
  className?: string;
}) {
  const m = live?.metrics ?? null;
  const rows: Array<[string, string, string]> = [
    ["CO₂", fmtInt(m?.co2_ppm), "ppm"],
    ["Temperatura", fmtDec(m?.temp_c), "°C"],
    ["Humedad", fmtInt(m?.rh_pct), "%"],
    ["Ocupación", m ? `${fmtInt(m.occupancy)} / ${fmtInt(space.capacity)}` : "—", "pers."],
    ["Potencia", fmtInt(m?.power_w), "W"],
  ];
  return (
    <aside
      aria-label={`Detalle de ${space.name}`}
      className={`panel border-brand/60 bg-panel/95 p-3.5 shadow-2xl backdrop-blur ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{space.name}</h2>
          <p className="num text-xs text-ink-2">
            {space.code} · {typeLabel(space.type)} · Piso {space.level}
          </p>
        </div>
        <button type="button" className="btn btn-sm !min-h-8 !px-2" onClick={onClose} aria-label="Cerrar panel del espacio">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2.5">
        <StatusBadge status={live?.status ?? "offline"} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {rows.map(([label, value, unit]) => (
          <div key={label} className="panel-flat px-2.5 py-2">
            <dt className="text-[11px] text-ink-2">{label}</dt>
            <dd className="num m-0 text-base text-ink">
              {value} <span className="text-[11px] text-ink-2">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="num mt-2.5 text-[11px] text-ink-2">
        Último dato {fmtAgo(live?.last_ts)} · fuente {live?.source ?? "—"}
      </p>
      <Link to={`/espacios/${encodeURIComponent(space.id)}`} className="btn btn-sm btn-primary mt-3 w-full no-underline">
        Ver detalle <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </aside>
  );
}
