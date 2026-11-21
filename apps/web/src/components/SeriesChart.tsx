import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtTime } from "../lib/format";

export interface SeriesRow {
  ts: number;
  [key: string]: number | undefined;
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface RefLine {
  y: number;
  label: string;
  color: string;
}

/** Grafico de lineas con estilo del sistema. Incluye resumen accesible. */
export function SeriesChart({
  title,
  unit,
  rows,
  series,
  refLines = [],
  height = 210,
  summary,
}: {
  title: string;
  unit: string;
  rows: SeriesRow[];
  series: SeriesDef[];
  refLines?: RefLine[];
  height?: number;
  summary: string;
}) {
  return (
    <figure className="m-0" aria-label={`${title}. ${summary}`}>
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span className="font-semibold text-ink">
          {title} <span className="font-normal text-ink-2">({unit})</span>
        </span>
        <span className="flex items-center gap-3">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <div style={{ height }} role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#24344F" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => fmtTime(v)}
              stroke="#93A3BC"
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
              minTickGap={42}
            />
            <YAxis stroke="#93A3BC" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} width={52} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ background: "#111B2E", border: "1px solid #24344F", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "#93A3BC" }}
              labelFormatter={(v) => fmtTime(Number(v), true)}
              formatter={(value, name) => [`${typeof value === "number" ? value.toFixed(1) : String(value)} ${unit}`, String(name)]}
            />
            {refLines.map((r) => (
              <ReferenceLine
                key={r.label}
                y={r.y}
                stroke={r.color}
                strokeDasharray="2 4"
                label={{ value: r.label, fill: r.color, fontSize: 10, position: "insideTopRight" }}
              />
            ))}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "6 4" : undefined}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
