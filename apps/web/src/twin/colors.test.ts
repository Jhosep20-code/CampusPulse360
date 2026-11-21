import { describe, expect, it } from "vitest";
import { STATUS_THRESHOLDS } from "@campuspulse/contracts";
import { colorForSpace, emissiveForNight, mixHex, primaryValueLabel } from "./colors";
import { liveSpace } from "./fixtures";
import type { TwinLayer } from "./types";

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const LAYERS: TwinLayer[] = ["status", "co2", "temperature", "occupancy", "energy"];

describe("colorForSpace - capa status", () => {
  it("asigna el color de cada estado", () => {
    expect(colorForSpace("status", liveSpace("ok"), 40)).toBe("#22D3D6");
    expect(colorForSpace("status", liveSpace("warning"), 40)).toBe("#F0B95B");
    expect(colorForSpace("status", liveSpace("critical"), 40)).toBe("#FF5C7A");
    expect(colorForSpace("status", liveSpace("offline", null), 40)).toBe("#64748B");
  });
});

describe("colorForSpace - sin dato", () => {
  it("devuelve el color offline en todas las capas", () => {
    for (const layer of LAYERS) {
      expect(colorForSpace(layer, undefined, 40)).toBe("#64748B");
      expect(colorForSpace(layer, null, 40)).toBe("#64748B");
      // La capa status solo depende del estado; las demas necesitan metricas.
      if (layer !== "status") expect(colorForSpace(layer, liveSpace("ok", null), 40)).toBe("#64748B");
      expect(colorForSpace(layer, liveSpace("offline", {}), 40)).toBe("#64748B");
    }
  });
});

describe("rampas", () => {
  // Rampas frio -> calido: el canal rojo no decrece (y el verde no crece desde el cian).
  function sample(layer: TwinLayer, key: "co2_ppm" | "temp_c" | "occupancy" | "power_w", from: number, to: number, cap = 100) {
    const out: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const v = from + ((to - from) * i) / 40;
      out.push(colorForSpace(layer, liveSpace("ok", { [key]: key === "occupancy" ? Math.round(v) : v }), cap));
    }
    return out;
  }

  const cases: Array<[string, string[]]> = [
    ["co2", sample("co2", "co2_ppm", 300, 2200)],
    ["temperature", sample("temperature", "temp_c", 10, 38)],
    ["occupancy", sample("occupancy", "occupancy", 0, 140)],
    ["energy", sample("energy", "power_w", 0, 9000)],
  ];

  for (const [name, colors] of cases) {
    it(`${name}: el canal rojo es no decreciente`, () => {
      const reds = colors.map((c) => rgb(c)[0]);
      for (let i = 1; i < reds.length; i++) expect(reds[i]!).toBeGreaterThanOrEqual(reds[i - 1]!);
    });
  }

  for (const [name, colors] of cases.filter(([n]) => n !== "temperature" && n !== "energy")) {
    it(`${name}: el canal verde es no creciente`, () => {
      const greens = colors.map((c) => rgb(c)[1]);
      for (let i = 1; i < greens.length; i++) expect(greens[i]!).toBeLessThanOrEqual(greens[i - 1]!);
    });
  }

  it("CO2: 400 ppm es cian, el umbral de aviso es dorado y 1500+ es critico", () => {
    expect(colorForSpace("co2", liveSpace("ok", { co2_ppm: 400 }), 40)).toBe("#22D3D6");
    expect(colorForSpace("co2", liveSpace("ok", { co2_ppm: STATUS_THRESHOLDS.co2_ppm.warning }), 40)).toBe(
      mixHex("#22D3D6", "#F0B95B", (1000 - 400) / 1100 / 0.55),
    );
    expect(colorForSpace("co2", liveSpace("ok", { co2_ppm: 1500 }), 40)).toBe("#FF5C7A");
    expect(colorForSpace("co2", liveSpace("ok", { co2_ppm: 4000 }), 40)).toBe("#FF5C7A");
  });

  it("temperatura: satura en 18 y 30 C", () => {
    expect(colorForSpace("temperature", liveSpace("ok", { temp_c: 5 }), 40)).toBe(
      colorForSpace("temperature", liveSpace("ok", { temp_c: 18 }), 40),
    );
    expect(colorForSpace("temperature", liveSpace("ok", { temp_c: 30 }), 40)).toBe("#FF5C7A");
  });

  it("ocupacion: usa la proporcion sobre la capacidad", () => {
    const half = colorForSpace("occupancy", liveSpace("ok", { occupancy: 20 }), 40);
    const sameRatio = colorForSpace("occupancy", liveSpace("ok", { occupancy: 60 }), 120);
    expect(half).toBe(sameRatio);
    expect(colorForSpace("occupancy", liveSpace("ok", { occupancy: 50 }), 40)).toBe("#FF5C7A");
  });
});

describe("emissiveForNight", () => {
  it("esta acotado en [0,1] para cualquier entrada", () => {
    for (const r of [-5, -0.1, 0, 0.25, 0.5, 1, 1.5, 10, Number.NaN, Infinity, -Infinity]) {
      const v = emissiveForNight(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("crece con la ocupacion", () => {
    let prev = emissiveForNight(0);
    for (let i = 1; i <= 20; i++) {
      const v = emissiveForNight(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(emissiveForNight(1)).toBe(1);
  });
});

describe("primaryValueLabel", () => {
  it("formatea el valor principal por capa", () => {
    const l = liveSpace("warning", { co2_ppm: 1240.4, temp_c: 26.54, occupancy: 38, power_w: 2450 });
    expect(primaryValueLabel("co2", l, 45)).toBe("1240 ppm");
    expect(primaryValueLabel("temperature", l, 45)).toBe("26,5 °C");
    expect(primaryValueLabel("occupancy", l, 45)).toBe("38/45 pers.");
    expect(primaryValueLabel("energy", l, 45)).toBe("2,5 kW");
    expect(primaryValueLabel("status", l, 45)).toBe("Advertencia");
    expect(primaryValueLabel("co2", null, 45)).toBe("Sin conexión");
  });
});
