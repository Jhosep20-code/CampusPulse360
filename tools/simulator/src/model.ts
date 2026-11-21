/**
 * Modelo de telemetria SIMULADA del campus (no son mediciones reales).
 *  - Ocupacion por tipo de espacio segun la hora de America/Lima (UTC-5, sin DST).
 *  - CO2 por balance de masa: C' = Cext + G*N/(V*ACH) en estado estable, con respuesta exponencial.
 *  - Temperatura que sube con la ocupacion y la hora del dia (relajacion de primer orden).
 *  - Potencia = base por tipo + componente por persona.
 *  - Ruido con PRNG sembrado (mulberry32): misma semilla, mismos datos.
 *  - Fallos ocasionales de dispositivo (opcionales).
 * Sin dependencias de ejecucion: solo tipos del contrato.
 */
import type { IngestReading, SpaceType } from "@campuspulse/contracts";

export interface DeviceDef {
  id: string;
  type: SpaceType;
  capacity: number;
}

/** Alineado con apps/api/migrations/0002_seed.sql. */
export const DEVICES: readonly DeviceDef[] = [
  { id: "DEV_1_LOBBY", type: "lobby", capacity: 120 },
  { id: "DEV_1_BIB", type: "library", capacity: 80 },
  { id: "DEV_2_A201", type: "classroom", capacity: 40 },
  { id: "DEV_2_A202", type: "classroom", capacity: 40 },
  { id: "DEV_3_A301", type: "classroom", capacity: 45 },
  { id: "DEV_3_LAB1", type: "lab", capacity: 30 },
  { id: "DEV_4_A401", type: "classroom", capacity: 45 },
  { id: "DEV_4_LAB2", type: "lab", capacity: 25 },
  { id: "DEV_5_AUD", type: "auditorium", capacity: 150 },
  { id: "DEV_5_OFI", type: "office", capacity: 20 },
];

export const CO2_OUTDOOR_PPM = 420;
/** Generacion de CO2 por persona en reposo ligero: ~0,0052 L/s -> 18,72 L/h = 0,01872 m3/h. */
const CO2_M3_PER_PERSON_H = 0.01872;
const LIMA_OFFSET_MS = -5 * 3_600_000;

/* ------------------------------------------------------------------ tiempo */

/** Hora local de Lima como numero decimal 0..24. */
export function limaHour(tsMs: number): number {
  const d = new Date(tsMs + LIMA_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** Dia de la semana en Lima: 0 = domingo ... 6 = sabado. */
export function limaWeekday(tsMs: number): number {
  return new Date(tsMs + LIMA_OFFSET_MS).getUTCDay();
}

function limaDayIndex(tsMs: number): number {
  return Math.floor((tsMs + LIMA_OFFSET_MS) / 86_400_000);
}

/* ------------------------------------------------------------------ PRNG */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ------------------------------------------------------------------ perfiles */

interface Profile {
  /** Fraccion objetivo de ocupacion (0..1+) segun hora y dia. */
  occFrac(hour: number, weekday: number): number;
  /** Renovaciones de aire por hora (ventilacion base). */
  ach: number;
  /** Volumen por plaza de aforo (m3). */
  volPerCap: number;
  baseW: number;
  perPersonW: number;
  tempBias: number;
}

const inAny = (h: number, blocks: Array<[number, number]>) => blocks.some(([a, b]) => h >= a && h < b);

const PROFILES: Record<SpaceType, Profile> = {
  classroom: {
    occFrac: (h, d) => {
      if (d === 0) return 0;
      if (inAny(h, [[7, 9], [9.25, 11.25], [11.5, 13.5], [14, 16], [16.25, 18.25], [18.5, 20.5]])) return 0.8;
      return h >= 7 && h < 21 ? 0.04 : 0;
    },
    ach: 6.5,
    volPerCap: 5,
    baseW: 600,
    perPersonW: 90,
    tempBias: 0,
  },
  lab: {
    occFrac: (h, d) => (d === 0 || h < 8 || h >= 20 ? 0 : d === 6 ? 0.3 : 0.65),
    ach: 6,
    volPerCap: 7,
    baseW: 1200,
    perPersonW: 150,
    tempBias: 1,
  },
  library: {
    occFrac: (h, d) => (d === 0 || h < 8 || h >= 21 ? 0 : 0.25 + 0.35 * Math.exp(-(((h - 15) / 4) ** 2))),
    ach: 5,
    volPerCap: 9,
    baseW: 1500,
    perPersonW: 60,
    tempBias: 0,
  },
  auditorium: {
    occFrac: (h, d) => {
      if (d === 0 || d === 6) return 0.02;
      if (inAny(h, [[10, 12]])) return 0.7;
      if (inAny(h, [[16, 18]])) return 0.55;
      return 0.03;
    },
    ach: 5.5,
    volPerCap: 12,
    baseW: 2500,
    perPersonW: 40,
    tempBias: 0.5,
  },
  lobby: {
    occFrac: (h) => {
      if (h < 6 || h >= 22) return 0;
      if (inAny(h, [[7, 8], [18, 19.5]])) return 0.3;
      if (inAny(h, [[12.5, 14]])) return 0.35;
      return 0.04;
    },
    ach: 4,
    volPerCap: 20,
    baseW: 900,
    perPersonW: 30,
    tempBias: 0,
  },
  office: {
    occFrac: (h, d) => {
      if (d === 0 || d === 6 || h < 8 || h >= 17) return 0;
      return inAny(h, [[13, 14]]) ? 0.3 : 0.7;
    },
    ach: 5,
    volPerCap: 10,
    baseW: 800,
    perPersonW: 110,
    tempBias: 0.5,
  },
};

/** Factor 0.7..1.15 estable por dispositivo y dia: dias de mala ventilacion o de aula llena. */
function dayFactors(seed: number, id: string, tsMs: number): { occ: number; vent: number } {
  const r = mulberry32(hashString(`${seed}:${id}:${limaDayIndex(tsMs)}`));
  return { occ: 0.5 + r() * 0.65, vent: 0.7 + r() * 0.3 };
}

/* ------------------------------------------------------------------ simulador */

export interface SimOptions {
  seed?: number;
  devices?: readonly DeviceDef[];
  /** Probabilidad por paso y dispositivo de iniciar una caida (3..8 pasos sin reportar). 0 = sin fallos. */
  failureRate?: number;
  /** Dispositivos en modo escenario: aula saturada con ventilacion degradada y calor. */
  scenarioDevices?: readonly string[];
}

interface DevState {
  def: DeviceDef;
  rand: () => number;
  lastTs: number | null;
  occ: number;
  co2: number;
  temp: number;
  outageLeft: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Simulator {
  private readonly seed: number;
  private readonly failureRate: number;
  private readonly scenario: Set<string>;
  private readonly state = new Map<string, DevState>();
  readonly devices: readonly DeviceDef[];

  constructor(opts: SimOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.failureRate = opts.failureRate ?? 0;
    this.scenario = new Set(opts.scenarioDevices ?? []);
    this.devices = opts.devices ?? DEVICES;
    for (const def of this.devices) {
      this.state.set(def.id, {
        def,
        rand: mulberry32(hashString(`${this.seed}:${def.id}`)),
        lastTs: null,
        occ: 0,
        co2: CO2_OUTDOOR_PPM,
        temp: 22,
        outageLeft: 0,
      });
    }
  }

  setScenario(deviceId: string, on: boolean): void {
    if (on) this.scenario.add(deviceId);
    else this.scenario.delete(deviceId);
  }

  /** Avanza todos los dispositivos hasta ts y devuelve las lecturas (omite los caidos). */
  step(tsMs: number): IngestReading[] {
    const out: IngestReading[] = [];
    for (const def of this.devices) {
      const r = this.stepDevice(def.id, tsMs);
      if (r) out.push(r);
    }
    return out;
  }

  /** Avanza un dispositivo hasta ts. null si el dispositivo esta caido en este paso. */
  stepDevice(deviceId: string, tsMs: number): IngestReading | null {
    const st = this.state.get(deviceId);
    if (!st) throw new Error(`dispositivo desconocido: ${deviceId}`);
    const { def, rand } = st;
    const prof = PROFILES[def.type];
    const hour = limaHour(tsMs);
    const f = dayFactors(this.seed, def.id, tsMs);
    const inScenario = this.scenario.has(def.id);

    const targetFrac = inScenario ? 1.25 : prof.occFrac(hour, limaWeekday(tsMs)) * (prof.occFrac(hour, limaWeekday(tsMs)) > 0.1 ? f.occ : 1);
    const targetOcc = Math.max(0, targetFrac * def.capacity);
    const ach = Math.max(0.3, prof.ach * f.vent * (inScenario ? 0.35 : 1));
    const volume = prof.volPerCap * def.capacity;
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 14));
    const occRatio = def.capacity > 0 ? st.occ / def.capacity : 0;
    const targetTemp = 21.5 + prof.tempBias + 2.5 * daylight + 3 * Math.min(occRatio, 1.3) + (inScenario ? 3 : 0);

    const dtS = st.lastTs === null ? 0 : Math.max(0, (tsMs - st.lastTs) / 1000);
    if (st.lastTs === null) {
      // Arranque: estado estable para la ocupacion objetivo.
      st.occ = targetOcc;
      st.co2 = CO2_OUTDOOR_PPM + ((CO2_M3_PER_PERSON_H * st.occ) / volume) * 1e6 / ach;
      st.temp = targetTemp;
    } else if (dtS > 0) {
      const dtH = dtS / 3600;
      st.occ += (targetOcc - st.occ) * (1 - Math.exp(-dtS / 300)); // las personas entran y salen en ~5 min
      const css = CO2_OUTDOOR_PPM + ((CO2_M3_PER_PERSON_H * st.occ) / volume) * 1e6 / ach;
      st.co2 = css + (st.co2 - css) * Math.exp(-ach * dtH);
      st.temp += (targetTemp - st.temp) * (1 - Math.exp(-dtS / 1500));
    }
    st.lastTs = tsMs;

    // Fallos ocasionales: el dispositivo deja de reportar unos pasos.
    if (st.outageLeft > 0) {
      st.outageLeft--;
      return null;
    }
    if (this.failureRate > 0 && rand() < this.failureRate) {
      st.outageLeft = 2 + Math.floor(rand() * 6);
      return null;
    }

    const occupancy = Math.round(clamp(st.occ + gauss(rand) * 0.6, 0, def.capacity * 1.5));
    const co2 = clamp(st.co2 + gauss(rand) * 8, 380, 5000);
    const temp = clamp(st.temp + gauss(rand) * 0.08, 10, 45);
    const rh = clamp(60 - 1.2 * (temp - 22) + gauss(rand) * 1.5, 25, 85);
    const power = clamp((prof.baseW + prof.perPersonW * occupancy) * (1 + gauss(rand) * 0.02), 0, 500_000);
    return {
      device_id: def.id,
      ts: tsMs,
      co2_ppm: Math.round(co2),
      temp_c: Math.round(temp * 10) / 10,
      rh_pct: Math.round(rh * 10) / 10,
      occupancy,
      power_w: Math.round(power),
    };
  }
}
