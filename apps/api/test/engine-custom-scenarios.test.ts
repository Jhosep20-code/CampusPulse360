import { beforeEach, describe, expect, it } from "vitest";
import { runCloudSimTick } from "../src/engine/cloud-sim";
import { runIncidentBot } from "../src/engine/incident-bot";
import { applyCustomScenario, applyScenario, restoreSpace, scenarioProfile, scenarioRamp } from "../src/engine/scenarios";
import { api, sessionCookie } from "./helpers";
import { count, E, MIN, NOW, reset } from "./engine-helpers";

const base = { co2_ppm: 650, temp_c: 22, rh_pct: 48, occupancy: 10, power_w: 900 };

async function incidentsOf(spaceId: string) {
  return (
    await E.DB.prepare("SELECT rule_id, severity, status FROM incidents WHERE space_id = ?1 ORDER BY rule_id").bind(spaceId).all<{
      rule_id: string;
      severity: string;
      status: string;
    }>()
  ).results;
}

describe("escenarios configurables (datos simulados)", () => {
  beforeEach(reset);

  it("perfiles: cada tipo cruza su umbral y la rampa termina sostenida en el objetivo", () => {
    expect(scenarioProfile("co2", "critical", base, 40).co2_ppm).toBe(1720);
    expect(scenarioProfile("temperature", "warning", base, 40).temp_c).toBe(28.6);
    expect(scenarioProfile("occupancy", "critical", base, 40).occupancy).toBe(48); // 120 % de 40
    expect(scenarioProfile("power", "critical", base, 40).power_w).toBe(6400);
    const ramp = scenarioRamp(base, scenarioProfile("co2", "critical", base, 40));
    expect(ramp).toHaveLength(6);
    expect(ramp[0]!.co2_ppm).toBeGreaterThan(base.co2_ppm);
    expect(ramp[0]!.co2_ppm).toBeLessThan(1720);
    expect(ramp.slice(2).every((r) => r.co2_ppm === 1720)).toBe(true);
  });

  it("CO2 critico en un espacio distinto de A301 abre la incidencia critica (sin la de advertencia duplicada)", async () => {
    const r = await applyCustomScenario(E, { space_id: "SPC_2_A201", kind: "co2", level: "critical", duration_min: 8 }, NOW);
    expect(r.device_id).toBe("DEV_2_A201");
    expect(r.inserted).toBe(6);
    expect(r.until).toBe(NOW + 8 * MIN);
    expect(r.expected_rules.map((x) => x.id).sort()).toEqual(["RULE_CO2_CRIT", "RULE_CO2_HIGH"]);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE source = 'sim-scenario' AND device_id = 'DEV_2_A201' AND ts <= ?1", NOW)).toBe(6);
    await runIncidentBot(E, NOW);
    const inc = await incidentsOf("SPC_2_A201");
    expect(inc.map((i) => i.rule_id)).toEqual(["RULE_CO2_CRIT"]);
    expect(await count("SELECT COUNT(*) AS n FROM incidents WHERE space_id != 'SPC_2_A201'")).toBe(0);
  });

  it("temperatura, sobreaforo y consumo electrico disparan SU regla en otros espacios", async () => {
    await applyCustomScenario(E, { space_id: "SPC_5_OFI", kind: "temperature", level: "warning", duration_min: 8 }, NOW);
    await applyCustomScenario(E, { space_id: "SPC_1_LOBBY", kind: "occupancy", level: "critical", duration_min: 8 }, NOW);
    const p = await applyCustomScenario(E, { space_id: "SPC_3_LAB1", kind: "power", level: "critical", duration_min: 8 }, NOW);
    expect(p.expected_rules.map((x) => x.id).sort()).toEqual(["RULE_POWER_CRIT", "RULE_POWER_HIGH"]);
    await runIncidentBot(E, NOW);
    expect((await incidentsOf("SPC_5_OFI")).map((i) => i.rule_id)).toEqual(["RULE_TEMP_HIGH"]);
    expect((await incidentsOf("SPC_1_LOBBY")).map((i) => i.rule_id)).toEqual(["RULE_OVERCAP"]);
    expect((await incidentsOf("SPC_3_LAB1")).map((i) => i.rule_id)).toEqual(["RULE_POWER_CRIT"]);
  });

  it("el perfil se mantiene por tick del bot mientras dura y el simulador en la nube no lo pisa", async () => {
    await applyCustomScenario(E, { space_id: "SPC_4_A401", kind: "co2", level: "warning", duration_min: 5 }, NOW);
    await runIncidentBot(E, NOW + MIN);
    const v = await E.DB.prepare("SELECT co2_ppm, source FROM readings WHERE device_id = 'DEV_4_A401' AND ts = ?1").bind(NOW + MIN).first<{
      co2_ppm: number;
      source: string;
    }>();
    expect(v).toEqual({ co2_ppm: 1320, source: "sim-scenario" });
    const sim = await runCloudSimTick({ ...E, CLOUD_SIM: "on" }, NOW + 2 * MIN);
    expect(sim.inserted).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE device_id = 'DEV_4_A401' AND source = 'sim' AND ts > ?1", NOW)).toBe(0);
  });

  it("sin conexion: no se inventan lecturas; ni el bot ni el simulador escriben para ese dispositivo", async () => {
    const r = await applyCustomScenario(E, { space_id: "SPC_5_AUD", kind: "offline", level: "critical", duration_min: 6 }, NOW);
    expect(r.profile).toBeNull();
    expect(r.inserted).toBe(0);
    await runIncidentBot(E, NOW + MIN);
    await runCloudSimTick({ ...E, CLOUD_SIM: "on" }, NOW + 2 * MIN);
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE device_id = 'DEV_5_AUD' AND ts > ?1", NOW)).toBe(0);
    // Los demas espacios siguen recibiendo datos (el escenario no congela el campus).
    expect(await count("SELECT COUNT(*) AS n FROM readings WHERE device_id != 'DEV_5_AUD' AND ts > ?1", NOW)).toBeGreaterThan(0);
  });

  it("restaurar quita el escenario, registra una lectura normal y cierra SOLO las incidencias de ese espacio", async () => {
    await applyCustomScenario(E, { space_id: "SPC_2_A202", kind: "co2", level: "critical", duration_min: 8 }, NOW);
    await applyCustomScenario(E, { space_id: "SPC_4_LAB2", kind: "temperature", level: "warning", duration_min: 8 }, NOW);
    await runIncidentBot(E, NOW);
    const r = await restoreSpace(E, "SPC_2_A202", NOW + 1000, "admin-1");
    expect(r).toEqual({ removed: 1, resolved: 1 });
    expect((await incidentsOf("SPC_2_A202")).every((i) => i.status === "resolved")).toBe(true);
    expect((await incidentsOf("SPC_4_LAB2")).every((i) => i.status !== "resolved")).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM scenario_overrides WHERE device_id = 'DEV_2_A202'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'resolved' AND actor = 'admin-1'")).toBe(1);
  });

  it("regresion: ningun escenario escribe devices.last_seen (pausaba el simulador de todo el campus)", async () => {
    const before = await E.DB.prepare("SELECT MAX(last_seen) AS t FROM devices").first<{ t: number | null }>();
    await applyScenario(E, "aula-saturada", NOW, "tester");
    await applyCustomScenario(E, { space_id: "SPC_2_A201", kind: "power", level: "warning", duration_min: 5 }, NOW);
    await applyScenario(E, "normalizar", NOW + 1000, "tester");
    const after = await E.DB.prepare("SELECT MAX(last_seen) AS t FROM devices").first<{ t: number | null }>();
    expect(after?.t ?? null).toBe(before?.t ?? null);
  });

  it("espacio inexistente -> error 404", async () => {
    await expect(applyCustomScenario(E, { space_id: "SPC_9_NADA", kind: "co2", level: "warning", duration_min: 5 }, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("HTTP de escenarios configurables", () => {
  it("solo un admin puede lanzar o restaurar; validacion del cuerpo", async () => {
    const body = { space_id: "SPC_2_A201", kind: "temperature", level: "warning", duration_min: 5 };
    expect((await api("/scenarios/custom", { method: "POST", json: body, headers: { "cf-connecting-ip": "203.0.113.10" } })).status).toBe(401);
    const op = await sessionCookie("operator");
    expect((await api("/scenarios/custom", { method: "POST", json: body, cookie: op.cookie, headers: { "cf-connecting-ip": "203.0.113.11" } })).status).toBe(403);
    const admin = await sessionCookie("admin");
    const h = { "cf-connecting-ip": "203.0.113.12" };
    const bad = await api("/scenarios/custom", { method: "POST", json: { ...body, kind: "inundacion" }, cookie: admin.cookie, headers: h });
    expect(bad.status).toBe(400);
    const ok = await api("/scenarios/custom", { method: "POST", json: body, cookie: admin.cookie, headers: h });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { expected_rules: { id: string }[] }).expected_rules.map((x) => x.id)).toEqual(["RULE_TEMP_HIGH"]);
    const rs = await api("/scenarios/restore", { method: "POST", json: { space_id: "SPC_2_A201" }, cookie: admin.cookie, headers: h });
    expect(rs.status).toBe(200);
    const audit = await E.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor = ?1 AND action IN ('scenario.custom','scenario.restore')")
      .bind(admin.userId)
      .first<{ n: number }>();
    expect(audit!.n).toBe(2);
  });
});
