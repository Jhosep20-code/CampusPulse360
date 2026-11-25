import { beforeEach, describe, expect, it } from "vitest";
import { runIncidentBot, AUTO_RESOLVE_MS } from "../src/engine/incident-bot";
import { E, MIN, count, putReadings, putSustained, reset } from "./engine-helpers";

describe("cierre automatico de incidencias (coherencia con el estado actual)", () => {
  beforeEach(reset);

  it("resuelve la incidencia cuando la condicion lleva 10 min normalizada", async () => {
    const t0 = 1_900_000_000_000;
    await putSustained("DEV_3_A301", t0, 3, { co2: 1600 });
    await runIncidentBot(E, t0);
    await runIncidentBot(E, t0 + 1000); // diagnostico -> open
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE status = 'open'")).toBeGreaterThanOrEqual(1);
    const t1 = t0 + AUTO_RESOLVE_MS + 2 * MIN;
    await putReadings("DEV_3_A301", Array.from({ length: 11 }, (_, i) => ({ ts: t1 - i * MIN, co2: 650, occ: 20 })));
    await runIncidentBot(E, t1);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE status IN ('open','acknowledged','pending_ai')")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'resolved' AND actor = 'incident-bot'")).toBeGreaterThanOrEqual(1);
  });

  it("no resuelve si la condicion persiste o no hay lecturas suficientes", async () => {
    const t0 = 1_900_000_000_000;
    await putSustained("DEV_3_A301", t0, 3, { co2: 1600 });
    await runIncidentBot(E, t0);
    await runIncidentBot(E, t0 + 1000);
    const t1 = t0 + AUTO_RESOLVE_MS + 2 * MIN;
    await putReadings("DEV_3_A301", [{ ts: t1 - MIN, co2: 650 }]); // solo 1 lectura
    await runIncidentBot(E, t1);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE status = 'open'")).toBeGreaterThanOrEqual(1);
  });
});
