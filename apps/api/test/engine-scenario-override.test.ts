import { beforeEach, describe, expect, it } from "vitest";
import { applyScenario } from "../src/engine/scenarios";
import { runIncidentBot } from "../src/engine/incident-bot";
import { E, MIN, count, putReadings, reset } from "./engine-helpers";
import { GW, reading, signedIngest } from "./helpers";

describe("escenarios con simulador en vivo (regresion de integracion)", () => {
  beforeEach(async () => {
    await reset();
    await E.DB.prepare("DELETE FROM scenario_overrides").run();
  });

  it("abre incidencia aunque el simulador haya intercalado lecturas normales", async () => {
    const now = Date.now();
    // El simulador envio lecturas normales cada 30 s en los ultimos 6 min.
    const rows = Array.from({ length: 13 }, (_, i) => ({ ts: now - 6 * MIN + i * 30_000, co2: 620, occ: 20 }));
    await putReadings("DEV_3_A301", rows);
    await applyScenario(E, "aula-saturada", now, "test");
    await runIncidentBot(E, now + 1000);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE space_id = 'SPC_3_A301'")).toBeGreaterThanOrEqual(1);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE device_id = 'DEV_3_A301' AND source = 'sim' AND ts >= ?", now - 6 * MIN)).toBe(0);
  });

  it("mantiene el perfil por tick y la ingesta ignora el simulador mientras el escenario esta activo", async () => {
    const now = Date.now();
    await E.DB.prepare("UPDATE devices SET gateway_id = ? WHERE id = 'DEV_3_A301'").bind(GW).run();
    await applyScenario(E, "aula-saturada", now, "test");
    await runIncidentBot(E, now + MIN);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE device_id = 'DEV_3_A301' AND ts = ? AND source = 'sim-scenario'", now + MIN)).toBe(1);
    const res = await signedIngest({ gateway_id: GW, readings: [reading("DEV_3_A301", { ts: now + 2000 })] });
    const body = (await res.json()) as { accepted: number; rejected: Array<{ reason: string }> };
    expect(body.accepted).toBe(0);
    expect(body.rejected[0]?.reason).toBe("escenario de demostracion activo");
  });

  it("normalizar elimina los escenarios activos", async () => {
    const now = Date.now();
    await applyScenario(E, "aula-saturada", now, "test");
    await applyScenario(E, "normalizar", now + 1000, "test");
    expect(await count("SELECT COUNT(*) AS n FROM scenario_overrides")).toBe(0);
  });
});
