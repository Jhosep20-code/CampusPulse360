import type { Env } from "../env";

/**
 * Simulador en la nube (telemetría SIMULADA, source 'sim').
 *
 * Mantiene viva la demo pública cuando ningún gateway (simulador Docker o
 * futuro sensor físico) ha enviado datos en los últimos 2 minutos. Se ejecuta
 * en el Cron de cada minuto, solo si CLOUD_SIM = "on". No actualiza
 * devices.last_seen: last_seen solo lo actualiza la ingesta real por HMAC.
 * Así, en cuanto un gateway vuelve a enviar datos, el simulador en la nube se
 * detiene solo. Los dispositivos con un escenario de demostración activo se
 * omiten.
 *
 * Coste: 2 consultas y un batch de ≤10 INSERT. El cálculo en JS es trivial,
 * muy por debajo de los 10 ms de CPU del plan Free.
 */
export const CLOUD_SIM_IDLE_MS = 2 * 60_000;

type SpaceType = "classroom" | "lab" | "library" | "auditorium" | "lobby" | "office";

interface DeviceRow {
  id: string;
  type: SpaceType;
  capacity: number;
}

/** Fracción de ocupación según la hora local de Lima (UTC-5) y el tipo de espacio. */
export function occupancyProfile(type: SpaceType, limaHour: number): number {
  const h = limaHour;
  const classes = (h >= 7 && h < 13) || (h >= 14 && h < 22);
  switch (type) {
    case "classroom":
      return classes ? (h >= 18 ? 0.8 : 0.65) : h >= 22 || h < 6 ? 0 : 0.1;
    case "lab":
      return classes ? 0.6 : h >= 22 || h < 6 ? 0 : 0.05;
    case "library":
      return h >= 8 && h < 21 ? 0.45 : 0.02;
    case "auditorium":
      return h >= 10 && h < 12 ? 0.55 : h >= 18 && h < 20 ? 0.4 : 0.02;
    case "lobby":
      return h >= 7 && h < 22 ? 0.25 : 0.02;
    case "office":
      return h >= 8 && h < 18 ? 0.7 : 0.05;
  }
}

/** Ruido determinista en [0,1) a partir del dispositivo y del minuto. */
export function noise(seed: string, minute: number): number {
  let x = 2166136261 ^ minute;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const BASE_POWER: Record<SpaceType, number> = {
  classroom: 600,
  lab: 1800,
  library: 900,
  auditorium: 1500,
  lobby: 700,
  office: 800,
};

export function simulateReading(d: DeviceRow, now: number) {
  const minute = Math.floor(now / 60_000);
  const limaHour = new Date(now - 5 * 3600_000).getUTCHours();
  const n1 = noise(d.id, minute);
  const n2 = noise(`${d.id}:t`, minute);
  const ratio = occupancyProfile(d.type, limaHour) * (0.85 + 0.3 * n1);
  const occupancy = Math.max(0, Math.round(d.capacity * ratio));
  const r = d.capacity > 0 ? occupancy / d.capacity : 0;
  return {
    co2_ppm: Math.round(Math.min(2500, 420 + 650 * r + 40 * (n2 - 0.5))),
    temp_c: Math.round((19 + 4.5 * r + 1.2 * (n2 - 0.5)) * 10) / 10,
    rh_pct: Math.round(42 + 10 * r + 6 * (n1 - 0.5)),
    occupancy,
    power_w: Math.round(BASE_POWER[d.type] + 22 * occupancy + 80 * (n1 - 0.5)),
  };
}

export async function runCloudSimTick(env: Env, now: number): Promise<{ inserted: number; skipped: string }> {
  if (env.CLOUD_SIM !== "on") return { inserted: 0, skipped: "desactivado" };
  const recent = await env.DB.prepare("SELECT MAX(last_seen) AS t FROM devices WHERE active = 1").first<{ t: number | null }>();
  if (recent?.t && now - recent.t < CLOUD_SIM_IDLE_MS) return { inserted: 0, skipped: "gateway-activo" };

  const { results } = await env.DB.prepare(
    `SELECT d.id, s.type, s.capacity FROM devices d JOIN spaces s ON s.id = d.space_id
      WHERE d.active = 1
        AND NOT EXISTS (SELECT 1 FROM scenario_overrides o WHERE o.device_id = d.id AND o.until > ?1)`,
  )
    .bind(now)
    .all<DeviceRow>();
  if (results.length === 0) return { inserted: 0, skipped: "sin-dispositivos" };

  const ts = Math.floor(now / 60_000) * 60_000;
  const ins = env.DB.prepare(
    "INSERT OR IGNORE INTO readings (device_id, ts, co2_ppm, temp_c, rh_pct, occupancy, power_w, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sim')",
  );
  await env.DB.batch(
    results.map((d) => {
      const v = simulateReading(d, now);
      return ins.bind(d.id, ts, v.co2_ppm, v.temp_c, v.rh_pct, v.occupancy, v.power_w);
    }),
  );
  return { inserted: results.length, skipped: "" };
}
