import { beforeEach, describe, expect, it } from "vitest";
import { runIncidentBot } from "../src/engine/incident-bot";
import { applyScenario } from "../src/engine/scenarios";
import { count, E, NOW, reset } from "./engine-helpers";

describe("escenarios", () => {
  beforeEach(reset);

  it("aula-saturada + incident-bot crea incidencias en SPC_3_A301", async () => {
    const r = await applyScenario(E, "aula-saturada", NOW, "tester");
    expect(r).toEqual({ inserted: 6, resolved: 0 });
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE ts > ?1", NOW)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE source = 'sim-scenario'")).toBe(6);
    await runIncidentBot(E, NOW);
    const rows = (
      await E.DB.prepare("SELECT space_id, rule_id FROM incidents ORDER BY rule_id").all<{ space_id: string; rule_id: string }>()
    ).results;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((x) => x.space_id === "SPC_3_A301")).toBe(true);
    expect(rows.map((x) => x.rule_id)).toEqual(["RULE_CO2_CRIT", "RULE_OVERCAP"]);
  });

  it("falla-climatizacion dispara la regla de temperatura en SPC_4_LAB2", async () => {
    await applyScenario(E, "falla-climatizacion", NOW, "tester");
    await runIncidentBot(E, NOW);
    const rows = (await E.DB.prepare("SELECT space_id, rule_id FROM incidents").all<{ space_id: string; rule_id: string }>()).results;
    expect(rows).toEqual([{ space_id: "SPC_4_LAB2", rule_id: "RULE_TEMP_HIGH" }]);
    const t = await E.DB.prepare("SELECT MIN(temp_c) AS lo, MAX(temp_c) AS hi FROM readings WHERE device_id = 'DEV_4_LAB2'").first<{
      lo: number;
      hi: number;
    }>();
    expect(t).toEqual({ lo: 29.5, hi: 31 });
  });

  it("normalizar resuelve las incidencias activas y no se reabren", async () => {
    await applyScenario(E, "aula-saturada", NOW, "tester");
    await runIncidentBot(E, NOW);
    const open = await count("SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved'");
    expect(open).toBeGreaterThan(0);
    const r = await applyScenario(E, "normalizar", NOW + 1000, "admin-1");
    expect(r.resolved).toBe(open);
    expect(r.inserted).toBe(10);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved' OR closed_at IS NULL")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'resolved' AND actor = 'admin-1'")).toBe(open);
    await runIncidentBot(E, NOW + 1000);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved'")).toBe(0);
  });
});
