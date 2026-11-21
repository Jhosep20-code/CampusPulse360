/** Convierte el content_json del bot de reportes en HTML imprimible (todo escapado). */
export interface ReportSpaceRow {
  name?: string;
  code?: string;
  co2_avg?: number | null;
  co2_max?: number | null;
  temp_avg?: number | null;
  occupancy_max?: number | null;
  incidents?: number;
  incidents_critical?: number;
}

export interface ReportContent {
  simulated?: boolean;
  period?: { start: number; end: number };
  spaces?: ReportSpaceRow[];
  totals?: Record<string, number | string | null>;
  narrative?: { text?: string; recomendaciones?: string[]; label?: string; model?: string; mode?: string };
}

const esc = (v: unknown): string =>
  String(v ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtDate = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }) : "—";

export function reportToHtml(c: ReportContent, title: string): string {
  const t = c.totals ?? {};
  const rows = (c.spaces ?? [])
    .map(
      (s) =>
        `<tr><td>${esc(s.name ?? s.code)}</td><td>${esc(s.co2_avg)}</td><td>${esc(s.co2_max)}</td><td>${esc(s.temp_avg)}</td><td>${esc(s.occupancy_max)}</td><td>${esc(s.incidents)}</td></tr>`,
    )
    .join("");
  const recs = (c.narrative?.recomendaciones ?? []).map((r) => `<li>${esc(r)}</li>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px;margin:0 0 4px}
.badge{display:inline-block;background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600}
table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
th{background:#f1f5f9}.muted{color:#475569;font-size:12px}</style></head><body>
<h1>${esc(title)}</h1>
<p class="muted">Periodo: ${esc(fmtDate(c.period?.start))} – ${esc(fmtDate(c.period?.end))} (hora de Lima)</p>
${c.simulated !== false ? '<p><span class="badge">DATOS SIMULADOS</span></p>' : ""}
<h2>Resumen</h2>
<p>Lecturas: ${esc(t.readings)} · Incidencias: ${esc(t.incidents)} (críticas: ${esc(t.incidents_critical)}) · CO₂ medio: ${esc(t.co2_avg)} ppm · CO₂ máx.: ${esc(t.co2_max)} ppm (${esc(t.co2_max_space)}) · Temp. media: ${esc(t.temp_avg)} °C</p>
<h2>Análisis</h2>
<p>${esc(c.narrative?.text)}</p>
${recs ? `<ul>${recs}</ul>` : ""}
<p class="muted">${esc(c.narrative?.label)}${c.narrative?.model ? ` · modelo: ${esc(c.narrative.model)}` : ""}</p>
<h2>Detalle por espacio</h2>
<table><thead><tr><th>Espacio</th><th>CO₂ medio</th><th>CO₂ máx.</th><th>Temp. media</th><th>Ocupación máx.</th><th>Incidencias</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}
