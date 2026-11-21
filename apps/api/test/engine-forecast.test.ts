import { beforeEach, describe, expect, it } from "vitest";
import { backtestMAE, fitHolt, holt } from "../src/forecast/holt";
import { forecastForSpace } from "../src/forecast/service";
import { E, MIN, NOW, putReadings, reset } from "./engine-helpers";

const linear = (n: number) => Array.from({ length: n }, (_, t) => 10 + 2 * t);

describe("holt", () => {
  it("serie lineal: prevision cercana a la tendencia y MAE pequeno", () => {
    const s = linear(20);
    const f = holt(s, 0.4, 0.4, 6);
    f.forEach((v, i) => expect(v).toBeCloseTo(10 + 2 * (20 + i), 6));
    expect(backtestMAE(s, 0.4, 0.4, 6)).toBeLessThan(1e-6);
    const fit = fitHolt(s, 6);
    expect(fit.mae).not.toBeNull();
    expect(fit.mae as number).toBeLessThan(1e-6);
  });

  it("serie ruidosa: MAE acotado; null con pocos puntos; casos limite", () => {
    const s = linear(30).map((v, i) => v + (i % 2 ? 1 : -1));
    expect(fitHolt(s, 6).mae as number).toBeLessThan(4);
    expect(fitHolt([1, 2, 3], 6).mae).toBeNull();
    expect(holt([], 0.4, 0.4, 3)).toEqual([]);
    expect(holt([5], 0.4, 0.4, 2)).toEqual([5, 5]);
  });
});

describe("forecastForSpace", () => {
  beforeEach(reset);

  it("devuelve historial en buckets de 5 min y 6 pasos (30 min) con MAE", async () => {
    const rows = [];
    for (let m = 180; m >= 0; m--) rows.push({ ts: NOW - m * MIN, co2: 600 + (180 - m) * 2 });
    await putReadings("DEV_2_A201", rows);
    const f = await forecastForSpace(E, "SPC_2_A201", "co2_ppm", NOW);
    expect(f).not.toBeNull();
    expect(f?.method).toBe("holt");
    expect(f?.horizon_min).toBe(30);
    expect(f?.forecast).toHaveLength(6);
    expect(f?.mae).not.toBeNull();
    expect(f?.mae as number).toBeLessThan(20);
    const lastPoint = f?.history[f.history.length - 1];
    expect(f?.forecast[5]?.value as number).toBeGreaterThan(lastPoint?.value as number);
    expect((f?.forecast[0]?.ts as number) - (lastPoint?.ts as number)).toBe(300_000);
  });

  it("menos de 12 puntos -> mae null; sin datos -> historial vacio; espacio inexistente -> null", async () => {
    const rows = [];
    for (let m = 30; m >= 0; m--) rows.push({ ts: NOW - m * MIN, co2: 700 });
    await putReadings("DEV_2_A201", rows);
    const f = await forecastForSpace(E, "SPC_2_A201", "co2_ppm", NOW);
    expect(f?.history.length).toBeLessThan(12);
    expect(f?.mae).toBeNull();
    const empty = await forecastForSpace(E, "SPC_2_A202", "temp_c", NOW);
    expect(empty?.history).toEqual([]);
    expect(await forecastForSpace(E, "SPC_9_NOPE", "co2_ppm", NOW)).toBeNull();
  });
});
