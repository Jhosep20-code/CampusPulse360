import { beforeEach, describe, expect, it } from "vitest";
import { MetricValues } from "@campuspulse/contracts";
import { runCloudSimTick, simulateReading, occupancyProfile } from "../src/engine/cloud-sim";
import { E, count, reset } from "./engine-helpers";

const env = (on: boolean) => ({ ...E, CLOUD_SIM: on ? "on" : "off" });

describe("simulador en la nube (telemetria simulada)", () => {
  beforeEach(async () => {
    await reset();
    await E.DB.prepare("DELETE FROM scenario_overrides").run();
  });

  it("desactivado por defecto", async () => {
    const r = await runCloudSimTick(env(false), Date.now());
    expect(r.inserted).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM readings")).toBe(0);
  });

  it("inserta una lectura por dispositivo activo si no hay gateway activo", async () => {
    const r = await runCloudSimTick(env(true), Date.now());
    expect(r.inserted).toBe(10);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE source = 'sim'")).toBe(10);
  });

  it("se detiene si un gateway envio datos hace menos de 2 minutos", async () => {
    const now = Date.now();
    await E.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = 'DEV_1_BIB'").bind(now - 30_000).run();
    const r = await runCloudSimTick(env(true), now);
    expect(r).toEqual({ inserted: 0, skipped: "gateway-activo" });
  });

  it("omite dispositivos con escenario activo y no duplica en el mismo minuto", async () => {
    const now = Date.now();
    await E.DB.prepare(
      "INSERT INTO scenario_overrides (device_id, scenario, started_at, until, co2_ppm, temp_c, rh_pct, occupancy, power_w) VALUES ('DEV_3_A301','aula-saturada',?1,?2,1700,27,58,52,2100)",
    ).bind(now, now + 600_000).run();
    expect((await runCloudSimTick(env(true), now)).inserted).toBe(9);
    await runCloudSimTick(env(true), now + 1000);
    expect(await count("SELECT COUNT(*) AS n FROM readings")).toBe(9);
  });

  it("valores dentro del contrato y ocupacion nula de madrugada", () => {
    for (const type of ["classroom", "lab", "library", "auditorium", "lobby", "office"] as const) {
      const v = simulateReading({ id: `DEV_X_${type}`, type, capacity: 40 }, Date.UTC(2026, 10, 24, 15));
      expect(MetricValues.safeParse(v).success).toBe(true);
    }
    expect(occupancyProfile("classroom", 3)).toBe(0);
  });
});
