import { ChatResponse } from "@campuspulse/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { answerAnchors, answerMatchesAnchors, assistantChat } from "../src/ai/chat";
import { detectIntent } from "../src/ai/intent";
import { runTool } from "../src/ai/tools";
import type { AIProvider } from "../src/ai/types";
import { runIncidentBot } from "../src/engine/incident-bot";
import { applyCustomScenario } from "../src/engine/scenarios";
import { count, E, insertIncident, MIN, NOW, putReadings, reset } from "./engine-helpers";

/*
 * Regresion del asistente (24-nov-2026). Defecto en produccion: «¿Cuál es el espacio más ocupado respecto a su
 * aforo?» respondia «No hay espacios con mayor ocupación respecto a su aforo» porque la unica herramienta disponible
 * era list_spaces_at_risk (solo advertencia/critico). Todos los datos son SIMULADOS.
 */

const DEVICES = ["DEV_1_LOBBY", "DEV_1_BIB", "DEV_2_A201", "DEV_2_A202", "DEV_3_A301", "DEV_3_LAB1", "DEV_4_A401", "DEV_4_LAB2", "DEV_5_AUD", "DEV_5_OFI"];
type Vals = { co2?: number; temp?: number; occ?: number; power?: number };

/** Lecturas normales (2 por dispositivo) y, encima, los valores indicados en la lectura de NOW. */
async function seed(over: Record<string, Vals> = {}): Promise<void> {
  await reset();
  for (const d of DEVICES) await putReadings(d, [{ ts: NOW - MIN, ...over[d] }, { ts: NOW, ...over[d] }]);
}

const NO_AI = { ...E, AI_PROVIDER: "workers-ai", AI: undefined } as typeof E;
const ask = (message: string, env = E, deps?: Parameters<typeof assistantChat>[3]) => assistantChat(env, { message, history: [] }, NOW, deps);

/** Pregunta con IA (mock determinista) y sin IA (respaldo por reglas); ambas deben dar los mismos datos. */
async function both(message: string) {
  const live = await ask(message);
  const fb = await ask(message, NO_AI);
  expect(ChatResponse.safeParse(live).success, message).toBe(true);
  expect(ChatResponse.safeParse(fb).success, message).toBe(true);
  expect(live.meta).toMatchObject({ provider: "mock", mode: "live" });
  expect(fb.meta).toMatchObject({ provider: "rules-fallback", model: "rules-v1", mode: "fallback" });
  expect(live.answer, message).toMatch(/simulad/i);
  expect(fb.answer, message).toMatch(/simulad/i);
  return { live, fb };
}

describe("enrutado determinista de preguntas (detectIntent)", () => {
  it.each([
    ["¿Cuál es el espacio más ocupado respecto a su aforo?", "occupancy_ratio_top"],
    ["¿Qué aula está más llena?", "occupancy_ratio_top"],
    ["¿Qué espacio tiene mayor porcentaje de ocupación?", "occupancy_ratio_top"],
    ["¿Qué espacio tiene más personas?", "occupancy_absolute_top"],
    ["¿Cuál es el espacio menos ocupado?", "occupancy_ratio_bottom"],
    ["¿Qué espacios superan su aforo?", "over_capacity"],
    ["¿Hay sobreaforo?", "over_capacity"],
    ["¿Qué espacios están vacíos?", "empty"],
    ["¿Qué dispositivos están desconectados?", "offline"],
    ["¿Dónde está el CO2 más alto?", "co2_top"],
    ["¿Qué aula tiene mejor calidad del aire? la de menor CO2", "co2_bottom"],
    ["¿Qué espacio tiene la temperatura más alta?", "temp_top"],
    ["¿Dónde hace más frío?", "temp_bottom"],
    ["¿Cuál es el consumo eléctrico por espacio?", "power"],
    ["¿Qué incidencias activas hay y cuál es su gravedad?", "incidents"],
    ["¿Qué acciones automáticas hizo el bot?", "bot"],
    ["¿Qué diagnósticos generó la IA?", "ai_diagnoses"],
    ["Dame el estado general del campus", "campus"],
    ["¿Qué espacios están en riesgo?", "at_risk"],
    ["Pronóstico de CO2 para A301", "forecast"],
    ["¿Cómo está el aula A401?", "space"],
  ])("%s -> %s", (q, id) => {
    expect(detectIntent(q)?.id).toBe(id);
  });

  it("pregunta ambigua -> null (la decide el modelo o, sin IA, se muestra el estado general)", () => {
    expect(detectIntent("hola, ¿qué tal?")).toBeNull();
  });
});

describe("1. el espacio más ocupado respecto a su aforo", () => {
  it("normal: devuelve el mayor PORCENTAJE aunque ningún espacio supere el aforo ni esté en riesgo", async () => {
    // A201 30/40 = 75 % (mayor %). AUD 100/150 = 66,7 % (mayor número absoluto). Todos en estado normal.
    await seed({ DEV_2_A201: { occ: 30 }, DEV_5_AUD: { occ: 100 } });
    const { live, fb } = await both("¿Cuál es el espacio más ocupado respecto a su aforo?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("Aula A201 (A201, piso 2)");
      expect(r.answer).toContain("30/40 personas = 75 % del aforo");
      expect(r.answer).toContain("Ningún espacio supera el 100 % de su aforo");
      expect(r.answer).toContain("Auditorio (AUD, piso 5) con 100 personas (66,7 %");
      expect(r.answer).not.toMatch(/no hay espacios/i);
      expect(r.actions).toEqual([{ type: "focus_spaces", ids: ["SPC_2_A201"] }]);
    }
  });

  it("ocupación absoluta es otro concepto: «más personas» -> AUD", async () => {
    await seed({ DEV_2_A201: { occ: 30 }, DEV_5_AUD: { occ: 100 } });
    const { live } = await both("¿Qué espacio tiene más personas?");
    expect(live.answer).toContain("El espacio con más personas (ocupación absoluta) es Auditorio (AUD, piso 5): 100 personas (66,7 % de su aforo de 150)");
  });

  it("advertencia y crítico: el ranking incluye estado y cuenta sobreaforos", async () => {
    // A202 38/40 = 95 % (advertencia); LAB2 30/25 = 120 % (crítico, sobreaforo).
    await seed({ DEV_2_A202: { occ: 38 }, DEV_4_LAB2: { occ: 30 } });
    const { fb } = await both("¿Cuál es el espacio más ocupado respecto a su aforo?");
    expect(fb.answer).toContain("Laboratorio de IoT (LAB2, piso 4): 30/25 personas = 120 % del aforo, estado crítico");
    expect(fb.answer).toContain("1 espacio(s) superan su aforo");
    expect(fb.answer).toContain("2. Aula A202 (A202, piso 2): 38/40 personas = 95 % del aforo");
  });

  it("sin datos: lo dice y no inventa un espacio", async () => {
    await reset();
    const { live, fb } = await both("¿Cuál es el espacio más ocupado respecto a su aforo?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("No hay lecturas recientes para calcular este ranking");
      expect(r.actions).toEqual([]);
    }
  });

  it("un espacio sin conexión se excluye del cálculo y se informa", async () => {
    await seed({ DEV_2_A201: { occ: 30 } });
    await E.DB.prepare("DELETE FROM readings WHERE device_id = 'DEV_5_OFI'").run();
    const { fb } = await both("¿Cuál es el espacio más ocupado respecto a su aforo?");
    expect(fb.answer).toContain("Sin lecturas recientes (excluidos del cálculo): OFI");
  });
});

describe("2. sobreaforo (> 100 %) y espacios vacíos", () => {
  it("ninguno en sobreaforo: lo dice y nombra el más cercano con su porcentaje", async () => {
    await seed({ DEV_2_A201: { occ: 30 } });
    const { live, fb } = await both("¿Qué espacios superan su aforo?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("Ningún espacio supera su aforo (más del 100 %)");
      expect(r.answer).toContain("El más cercano es Aula A201 (A201, piso 2): 30/40 personas = 75 % del aforo");
    }
  });

  it("crítico: lista solo los que superan el 100 % (100 % exacto no es sobreaforo)", async () => {
    await seed({ DEV_4_LAB2: { occ: 30 }, DEV_5_AUD: { occ: 180 }, DEV_3_LAB1: { occ: 30 } });
    const { fb } = await both("¿Hay sobreaforo?");
    expect(fb.answer).toContain("2 espacio(s) en sobreaforo");
    expect(fb.answer).toContain("Auditorio (AUD, piso 5): 180/150 personas = 120 % del aforo, estado crítico");
    expect(fb.answer).toContain("Laboratorio de IoT (LAB2, piso 4): 30/25 personas = 120 % del aforo");
    expect(fb.answer).not.toContain("LAB1");
  });

  it("vacíos = ocupación 0", async () => {
    await seed({ DEV_5_OFI: { occ: 0 }, DEV_1_BIB: { occ: 0 } });
    const { fb } = await both("¿Qué espacios están vacíos?");
    expect(fb.answer).toContain("2 espacio(s) vacíos (ocupación 0)");
    expect(fb.answer).toContain("Biblioteca (BIB, piso 1): 0/80 personas");
    expect(fb.answer).toContain("Oficinas administrativas (OFI, piso 5): 0/20 personas");
  });
});

describe("3-4. CO2 y temperatura más altos", () => {
  it("CO2: crítico en A401 (no A301) con su valor y ocupación", async () => {
    await seed({ DEV_4_A401: { co2: 1720, occ: 40 }, DEV_3_A301: { co2: 1100 } });
    const { live, fb } = await both("¿Dónde está el CO2 más alto?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("El espacio con el CO2 más alto es Aula A401 (A401, piso 4): CO2 1720 ppm, estado crítico");
      expect(r.answer).toContain("Ocupación del espacio: 40/45 personas = 88,9 % del aforo");
    }
  });

  it("temperatura: advertencia en LAB1 y la más baja", async () => {
    await seed({ DEV_3_LAB1: { temp: 28.5 }, DEV_1_LOBBY: { temp: 19.2 } });
    const hot = await both("¿Qué espacio tiene la temperatura más alta?");
    expect(hot.fb.answer).toContain("El espacio con la temperatura más alta es Laboratorio de computo (LAB1, piso 3): 28,5 °C, estado advertencia");
    const cold = await both("¿Dónde hace más frío?");
    expect(cold.fb.answer).toContain("El espacio con la temperatura más baja es Hall de ingreso (LOBBY, piso 1): 19,2 °C");
  });
});

describe("5-6. incidencias activas y dispositivos desconectados", () => {
  it("incidencias: conteo por severidad, espacio y código; las críticas primero", async () => {
    await seed();
    await insertIncident("inc_w", "SPC_3_LAB1", "RULE_TEMP_HIGH", NOW - 2 * MIN);
    await E.DB.prepare("UPDATE incidents SET severity = 'warning', status = 'open', title = 'Temperatura alta' WHERE id = 'inc_w'").run();
    await insertIncident("inc_c", "SPC_4_A401", "RULE_CO2_CRIT", NOW - MIN);
    const { live, fb } = await both("¿Qué incidencias activas hay y cuál es su gravedad?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("2 incidencias activas (datos simulados): 1 críticas, 1 de advertencia");
      expect(r.answer.indexOf("A401")).toBeLessThan(r.answer.indexOf("LAB1"));
      expect(r.answer).toContain("[crítica] Aula A401 (A401)");
    }
  });

  it("sin incidencias", async () => {
    await seed();
    const { fb } = await both("¿Hay incidencias abiertas?");
    expect(fb.answer).toContain("No hay incidencias activas");
  });

  it("desconectados: más de 3 min sin lecturas, con dispositivo y minutos", async () => {
    await seed();
    await E.DB.prepare("DELETE FROM readings WHERE device_id = 'DEV_5_OFI' AND ts > ?1").bind(NOW - 10 * MIN).run();
    await putReadings("DEV_5_OFI", [{ ts: NOW - 10 * MIN }]);
    const { live, fb } = await both("¿Qué dispositivos están desconectados?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("1 espacio(s) con dispositivos desconectados");
      expect(r.answer).toContain("Oficinas administrativas (OFI, piso 5): dispositivo DEV_5_OFI, última lectura hace 10 min");
    }
  });

  it("ninguno desconectado", async () => {
    await seed();
    const { fb } = await both("¿Hay sensores sin conexión?");
    expect(fb.answer).toContain("Todos los dispositivos están reportando");
  });
});

describe("7. consumo eléctrico", () => {
  it("ranking por potencia con el mayor consumo primero", async () => {
    await seed({ DEV_5_AUD: { power: 4800 }, DEV_3_LAB1: { power: 2600 } });
    const { live, fb } = await both("¿Cuál es el consumo eléctrico por espacio?");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("El espacio con mayor consumo eléctrico es Auditorio (AUD, piso 5): 4800 W, estado advertencia");
      expect(r.answer).toContain("2. Laboratorio de computo (LAB1, piso 3): 2600 W");
    }
  });
});

describe("8-9. acciones del bot y diagnósticos de IA (flujo real del bot)", () => {
  it("sin actividad", async () => {
    await seed();
    const bot = await both("¿Qué acciones automáticas hizo el bot?");
    expect(bot.fb.answer).toContain("El bot no registró ejecuciones en las últimas 24 h");
    const dx = await both("¿Qué diagnósticos generó la IA?");
    expect(dx.fb.answer).toContain("Todavía no hay diagnósticos");
  });

  it("tras un ciclo del bot: ejecución, incidencia abierta y diagnóstico con proveedor y modelo", async () => {
    await seed();
    await applyCustomScenario(E, { space_id: "SPC_4_A401", kind: "co2", level: "critical", duration_min: 8 }, NOW);
    await runIncidentBot(E, NOW);
    const bot = await both("¿Qué acciones automáticas hizo el bot?");
    expect(bot.fb.answer).toContain("1 ejecuciones (incident-bot: 1 correctas)");
    expect(bot.fb.answer).toContain("Incidencias abiertas por el bot: 1");
    expect(bot.fb.answer).toContain("diagnósticos generados: 1");
    const dx = await both("¿Qué diagnósticos generó la IA?");
    expect(dx.fb.answer).toContain("Aula A401 (A401)");
    // En pruebas el proveedor es el mock determinista; en produccion seria workers-ai · @cf/openai/gpt-oss-20b.
    expect(dx.fb.answer).toContain("IA mock · mock-model");
  });
});

describe("10. estado general del campus", () => {
  it("resume estados, ocupación total con porcentaje, incidencias y el más ocupado", async () => {
    await seed({ DEV_2_A201: { occ: 30 }, DEV_4_A401: { co2: 1720 } });
    const { live, fb } = await both("Dame el estado general del campus");
    for (const r of [live, fb]) {
      expect(r.answer).toContain("10 espacios (9 normales, 0 en advertencia, 1 críticos, 0 sin datos)");
      expect(r.answer).toContain("Ocupación 75/595 personas (12,6 % del aforo total)" /* 9 espacios x 5 + 30 */);
      expect(r.answer).toContain("Mayor ocupación relativa: Aula A201 (A201, piso 2), 30/40 personas = 75 % del aforo");
      expect(r.answer).toContain("Aula A401 (A401: CO2 1720 ppm)");
    }
  });

  it("pregunta ambigua sin IA: lo indica y muestra el estado general", async () => {
    await seed();
    const r = await ask("hola, ¿qué tal?", NO_AI);
    expect(r.meta.mode).toBe("fallback");
    expect(r.answer).toContain("no reconocí el tipo de pregunta");
    expect(r.answer).toContain("Campus (datos simulados): 10 espacios");
  });
});

describe("fidelidad de la redacción de la IA", () => {
  const liar = (answer: string): AIProvider => ({
    name: "workers-ai",
    model: "@cf/openai/gpt-oss-20b",
    complete: async () => ({ text: JSON.stringify({ answer, citations: ["SPC_5_AUD"], focus_space_ids: ["SPC_5_AUD"] }), latencyMs: 5 }),
  });

  it("si la IA cambia el espacio, se descarta y se responde con el cálculo verificado", async () => {
    await seed({ DEV_2_A201: { occ: 30 }, DEV_5_AUD: { occ: 100 } });
    const r = await ask("¿Cuál es el espacio más ocupado respecto a su aforo?", E, {
      provider: liar("No hay espacios con mayor ocupación respecto a su aforo (datos simulados)."),
    });
    expect(r.meta).toMatchObject({ provider: "rules-fallback", mode: "fallback" });
    expect(r.answer).toContain("no coincidía con el cálculo del servidor");
    expect(r.answer).toContain("Aula A201 (A201, piso 2): 30/40 personas = 75 % del aforo");
    const rejected = await E.DB.prepare("SELECT provider, model, mode, valid_json FROM ai_outputs WHERE valid_json = 0").first();
    expect(rejected).toEqual({ provider: "workers-ai", model: "@cf/openai/gpt-oss-20b", mode: "live", valid_json: 0 });
  });

  it("si la IA nombra el espacio pero cambia la cifra, también se descarta", async () => {
    await seed({ DEV_2_A201: { occ: 30 } });
    const r = await ask("¿Cuál es el espacio más ocupado respecto a su aforo?", E, { provider: liar("El más ocupado es A201 con 90 % (datos simulados).") });
    expect(r.meta.mode).toBe("fallback");
  });

  it("una redacción fiel se acepta como live, con proveedor y modelo reales, y ahorra la llamada de selección", async () => {
    await seed({ DEV_2_A201: { occ: 30 } });
    const r = await ask("¿Cuál es el espacio más ocupado respecto a su aforo?", E, {
      provider: liar("El espacio más ocupado respecto a su aforo es el Aula A201: 30 de 40 personas, el 75 % (datos simulados)."),
    });
    expect(r.meta).toMatchObject({ provider: "workers-ai", model: "@cf/openai/gpt-oss-20b", mode: "live" });
    expect(await count("SELECT calls AS n FROM ai_quota")).toBe(1);
  });

  it("anclas: tolera separadores de miles y exige código y cifra", async () => {
    await seed({ DEV_4_A401: { co2: 1720 } });
    const exec = await runTool(E, "rank_spaces", { metric: "co2_ppm", order: "desc" }, NOW);
    const a = answerAnchors(exec)!;
    expect(a).toEqual({ code: "A401", name: "Aula A401", number: "1720" });
    expect(answerMatchesAnchors("El aula A401 llega a 1.720 ppm", a)).toBe(true);
    expect(answerMatchesAnchors("El aula A401 llega a 1 720 ppm", a)).toBe(true);
    expect(answerMatchesAnchors("El aula A401 llega a 1500 ppm", a)).toBe(false);
    expect(answerMatchesAnchors("El aula A301 llega a 1720 ppm", a)).toBe(false);
  });
});

describe("coherencia con una anomalía fuera de A301 (asistente, KPI, incidencia y gemelo)", () => {
  it("sobreaforo crítico en el Auditorio: todas las vistas señalan AUD con 120 %", async () => {
    await seed();
    const sc = await applyCustomScenario(E, { space_id: "SPC_5_AUD", kind: "occupancy", level: "critical", duration_min: 8 }, NOW);
    expect(sc.profile?.occupancy).toBe(180); // 120 % de 150
    await runIncidentBot(E, NOW);

    // Incidencia abierta por el bot.
    const inc = await E.DB.prepare("SELECT rule_id, severity FROM incidents WHERE space_id = 'SPC_5_AUD' AND status != 'resolved'").all();
    expect(inc.results).toEqual([{ rule_id: "RULE_OVERCAP", severity: "critical" }]);

    // Estado del gemelo / KPI: la misma consulta en vivo que alimenta /live.
    const status = await runTool(E, "get_space_status", { space_id: "AUD" }, NOW);
    expect(status.result).toMatchObject({ status: "critical", occupancy_ratio: 1.2 });

    // Asistente: tres preguntas distintas apuntan al mismo espacio y la misma cifra.
    const most = await both("¿Cuál es el espacio más ocupado respecto a su aforo?");
    expect(most.fb.answer).toContain("Auditorio (AUD, piso 5): 180/150 personas = 120 % del aforo, estado crítico");
    const over = await both("¿Qué espacios superan su aforo?");
    expect(over.fb.answer).toContain("1 espacio(s) en sobreaforo");
    expect(over.fb.answer).toContain("Auditorio (AUD, piso 5): 180/150 personas = 120 % del aforo");
    const incs = await both("¿Qué incidencias activas hay?");
    expect(incs.fb.answer).toContain("Auditorio (AUD)");
    for (const r of [most.live, over.live, incs.live]) expect(r.actions[0]?.ids).toContain("SPC_5_AUD");
  });
});
