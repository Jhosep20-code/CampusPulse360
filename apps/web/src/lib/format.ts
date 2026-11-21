const nf0 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : nf0.format(n);
}

export function fmtDec(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : nf1.format(n);
}

/** Vatios a kW con un decimal. */
export function fmtKw(w: number | null | undefined): string {
  return w === null || w === undefined ? "—" : nf1.format(w / 1000);
}

export function fmtPct(ratio: number): string {
  return `${nf0.format(Math.round(ratio * 100))} %`;
}

export function fmtDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  return new Date(ts).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(ts: number | null | undefined, withSeconds = false): string {
  if (ts === null || ts === undefined) return "—";
  return new Date(ts).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

/** "hace 3 min" a partir de una marca de tiempo. */
export function fmtAgo(ts: number | null | undefined, now = Date.now()): string {
  if (ts === null || ts === undefined) return "sin datos";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
