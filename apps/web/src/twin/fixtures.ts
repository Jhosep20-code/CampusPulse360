import type { CampusResponse, LiveSpace, MetricValues, SpaceStatus } from "@campuspulse/contracts";

/** Datos de prueba del gemelo (copia del seed provisional; no son datos reales). */
const SEED: Array<[number, string, string, "classroom" | "lab" | "library" | "auditorium" | "lobby" | "office", number]> = [
  [1, "LOBBY", "Hall de ingreso", "lobby", 120],
  [1, "BIB", "Biblioteca", "library", 80],
  [2, "A201", "Aula A201", "classroom", 40],
  [2, "A202", "Aula A202", "classroom", 40],
  [3, "A301", "Aula A301", "classroom", 45],
  [3, "LAB1", "Laboratorio de computo", "lab", 30],
  [4, "A401", "Aula A401", "classroom", 45],
  [4, "LAB2", "Laboratorio de IoT", "lab", 25],
  [5, "AUD", "Auditorio", "auditorium", 150],
  [5, "OFI", "Oficinas administrativas", "office", 20],
];

export function makeCampus(extraSpacesOnLevel6 = 0): CampusResponse {
  const levels = [1, 2, 3, 4, 5, ...(extraSpacesOnLevel6 > 0 ? [6] : [])];
  const spaces: CampusResponse["spaces"] = SEED.map(([level, code, name, type, capacity]) => ({
    id: `SPC_${level}_${code}`,
    floor_id: `FLR_${level}`,
    level,
    code,
    name,
    type,
    capacity,
    mesh_id: `SPC_${level}_${code}`,
  }));
  for (let i = 0; i < extraSpacesOnLevel6; i++) {
    const code = `X${i + 1}0`;
    spaces.push({
      id: `SPC_6_${code}`,
      floor_id: "FLR_6",
      level: 6,
      code,
      name: `Espacio ${code}`,
      type: "classroom",
      capacity: 30,
      mesh_id: `SPC_6_${code}`,
    });
  }
  return {
    building: { id: "BLD_1", name: "Edificio provisional", geometry_provisional: true },
    floors: levels.map((level) => ({ id: `FLR_${level}`, building_id: "BLD_1", level, name: `Piso ${level}` })),
    spaces,
  };
}

export const BASE_METRICS: MetricValues = { co2_ppm: 600, temp_c: 22, rh_pct: 45, occupancy: 10, power_w: 800 };

export function liveSpace(
  status: SpaceStatus,
  metrics: Partial<MetricValues> | null = {},
  spaceId = "SPC_3_A301",
): LiveSpace {
  return {
    space_id: spaceId,
    mesh_id: spaceId,
    status,
    last_ts: status === "offline" ? null : 1_800_000_000_000,
    source: status === "offline" ? null : "sim",
    metrics: metrics === null ? null : { ...BASE_METRICS, ...metrics },
  };
}
