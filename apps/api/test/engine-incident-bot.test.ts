import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIncidentBot } from "../src/engine/incident-bot";
import { count, E, NOW, putReadings, putSustained, reset } from "./engine-helpers";

describe("incident-bot", () => {
  beforeEach(reset);
  afterEach(() => vi.restoreAllMocks());

  it("CO2 >= 1500 sostenido 3 min crea exactamente 1 incidencia y no la duplica", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await putSustained("DEV_3_A301", NOW, 3, { co2: 1600, occ: 30 });
    const r1 = await runIncidentBot(E, NOW);
    expect(r1.status).toBe("success");
    expect(await count("SELECT COUNT(*) AS n FROM incidents")).toBe(1);
    const inc = await E.DB.prepare("SELECT * FROM incidents").first<{
      rule_id: string;
      space_id: string;
      status: string;
      severity: string;
      ai_output_id: string;
    }>();
    expect(inc?.rule_id).toBe("RULE_CO2_CRIT");
    expect(inc?.space_id).toBe("SPC_3_A301");
    expect(inc?.severity).toBe("critical");
    // diagnostico con MockProvider: ai_output valido y estado 'open'
    expect(inc?.status).toBe("open");
    const out = await E.DB.prepare("SELECT valid_json, mode, provider FROM ai_outputs WHERE id = ?1")
      .bind(inc?.ai_output_id)
      .first<{ valid_json: number; mode: string; provider: string }>();
    expect(out).toMatchObject({ valid_json: 1, mode: "live", provider: "mock" });
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'opened'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'diagnosed'")).toBe(1);

    await runIncidentBot(E, NOW + 1000);
    expect(await count("SELECT COUNT(*) AS n FROM incidents")).toBe(1);
    // sin Telegram configurado no se llama a fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    const run = await E.DB.prepare(
      "SELECT status, finished_at, summary FROM bot_runs WHERE bot = 'incident-bot' ORDER BY started_at LIMIT 1",
    ).first<{ status: string; finished_at: number | null; summary: string }>();
    expect(run?.status).toBe("success");
    expect(run?.finished_at).not.toBeNull();
    expect(run?.summary).toContain("telegram=no-configurado");
  });

  it("una condicion no sostenida (una sola lectura alta) no crea incidencias", async () => {
    await putSustained("DEV_3_A301", NOW, 3, { co2: 700 });
    await putReadings("DEV_3_A301", [{ ts: NOW, co2: 1900 }]);
    await runIncidentBot(E, NOW);
    expect(await count("SELECT COUNT(*) AS n FROM incidents")).toBe(0);
    // una unica lectura (n < 2) tampoco dispara
    await reset();
    await putReadings("DEV_3_A301", [{ ts: NOW, co2: 1900 }]);
    await runIncidentBot(E, NOW);
    expect(await count("SELECT COUNT(*) AS n FROM incidents")).toBe(0);
  });

  it("CO2 entre 1200 y 1500 sostenido 2 min abre la regla de advertencia", async () => {
    await putSustained("DEV_2_A201", NOW, 2, { co2: 1300 });
    await runIncidentBot(E, NOW);
    const rows = (await E.DB.prepare("SELECT rule_id FROM incidents").all<{ rule_id: string }>()).results;
    expect(rows.map((r) => r.rule_id)).toEqual(["RULE_CO2_HIGH"]);
  });

  it("con Telegram configurado envia un mensaje y registra notified sin exponer el token", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const env2 = { ...E, TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN", TELEGRAM_CHAT_ID: "42" };
    await putSustained("DEV_3_A301", NOW, 3, { co2: 1600, occ: 30 });
    const r = await runIncidentBot(env2, NOW);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123456:TEST-TOKEN/sendMessage");
    expect(String(init.body)).toContain("simulados");
    expect(String(init.body)).toContain("/incidentes/inc_");
    expect(await count("SELECT COUNT(*) AS n FROM incident_events WHERE kind = 'notified'")).toBe(1);
    expect(r.summary).not.toContain("TEST-TOKEN");
  });

  it("un fallo de Telegram no rompe el bot ni filtra el token", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("red caida con TEST-TOKEN"));
    const env2 = { ...E, TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN", TELEGRAM_CHAT_ID: "42" };
    await putSustained("DEV_3_A301", NOW, 3, { co2: 1600 });
    const r = await runIncidentBot(env2, NOW);
    expect(r.status).toBe("success");
    expect(r.summary).toContain("telegram=error-de-red");
    expect(r.summary).not.toContain("TEST-TOKEN");
  });
});
