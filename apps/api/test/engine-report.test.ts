import { beforeEach, describe, expect, it } from "vitest";
import { runReportBot } from "../src/engine/report-bot";
import { runIncidentBot } from "../src/engine/incident-bot";
import { count, E, MIN, NOW, putReadings, putSustained, reset } from "./engine-helpers";

describe("report-bot", () => {
  beforeEach(async () => {
    await reset();
    const rows = [];
    for (let m = 120; m >= 0; m--) rows.push({ ts: NOW - m * MIN, co2: 800, temp: 24, occ: 10 });
    await putReadings("DEV_2_A201", rows);
    await putSustained("DEV_3_A301", NOW, 5, { co2: 1700, occ: 52, temp: 26 });
    await runIncidentBot(E, NOW);
  });

  it("genera rollups de 5 min y un reporte diario marcado como simulado (narrativa IA con mock)", async () => {
    const r = await runReportBot(E, NOW);
    expect(r.status).toBe("success");
    expect(await count("SELECT COUNT(*) AS n FROM readings_5m")).toBeGreaterThan(20);
    const rep = await E.DB.prepare("SELECT kind, period_start, period_end, content_json FROM reports").first<{ kind: string; period_start: number; period_end: number; content_json: string }>();
    expect(rep?.kind).toBe("daily");
    expect((rep?.period_end ?? 0) - (rep?.period_start ?? 0)).toBe(86_400_000);
    const c = JSON.parse(rep?.content_json ?? "{}");
    expect(c.simulated).toBe(true);
    expect(c.spaces).toHaveLength(10);
    const a301 = c.spaces.find((s: { space_id: string }) => s.space_id === "SPC_3_A301");
    expect(a301).toMatchObject({ co2_max: 1700, incidents: 2, incidents_critical: 2, occupancy_max: 52 });
    const a201 = c.spaces.find((s: { space_id: string }) => s.space_id === "SPC_2_A201");
    expect(a201).toMatchObject({ co2_avg: 800, temp_avg: 24, incidents: 0 });
    expect(c.totals).toMatchObject({ spaces: 10, incidents: 2, co2_max: 1700, co2_max_space: "Aula A301" });
    expect(c.narrative.mode).toBe("live");
    expect(c.narrative.text.length).toBeGreaterThan(10);
  });

  it("sin proveedor la narrativa es determinista y esta etiquetada", async () => {
    const r = await runReportBot(E, NOW, { provider: null });
    expect(r.status).toBe("success");
    const rep = await E.DB.prepare("SELECT content_json FROM reports").first<{ content_json: string }>();
    const c = JSON.parse(rep?.content_json ?? "{}");
    expect(c.narrative).toMatchObject({ mode: "fallback", provider: "rules-fallback" });
    expect(c.narrative.label).toContain("sin IA");
    expect(c.narrative.text).toContain("datos simulados");
  });
});
