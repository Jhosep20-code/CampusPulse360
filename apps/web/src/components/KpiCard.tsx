import type { ReactNode } from "react";
import { PulseValue } from "./ui";

export type Tone = "neutral" | "ok" | "warn" | "crit" | "off";

const TONE: Record<Tone, string> = {
  neutral: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
  off: "text-ink-2",
};

export function KpiCard({
  label,
  value,
  unit,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1 px-3.5 py-3" role="group" aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-ink-2">
        <span className={TONE[tone]} aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <PulseValue value={value} className={`num text-2xl font-medium leading-none ${TONE[tone]}`} />
        {unit ? <span className="text-xs text-ink-2">{unit}</span> : null}
      </div>
      {sub ? <div className="num truncate text-[11px] text-ink-2">{sub}</div> : null}
    </div>
  );
}
