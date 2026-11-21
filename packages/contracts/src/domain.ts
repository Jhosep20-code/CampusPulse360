import { z } from "zod";

/** Roles del sistema. El visitante es anonimo y de solo lectura (sin cuenta). */
export const Role = z.enum(["admin", "operator", "visitor"]);
export type Role = z.infer<typeof Role>;

export const Severity = z.enum(["info", "warning", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const IncidentStatus = z.enum(["pending_ai", "open", "acknowledged", "resolved"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

/** Variables medidas por cada dispositivo (tabla ancha `readings`). */
export const Metric = z.enum(["co2_ppm", "temp_c", "rh_pct", "occupancy", "power_w"]);
export type Metric = z.infer<typeof Metric>;

/**
 * Origen del dato. Toda telemetria actual es SIMULADA:
 * - sim: simulador IoT (gateway firmado con HMAC)
 * - sim-scenario: escenario de demostracion generado en servidor
 * - device: reservado para sensores fisicos (no usado todavia)
 */
export const DataSource = z.enum(["sim", "sim-scenario", "device"]);
export type DataSource = z.infer<typeof DataSource>;

export const SpaceType = z.enum(["classroom", "lab", "library", "auditorium", "lobby", "office"]);
export type SpaceType = z.infer<typeof SpaceType>;

/** Estado visual de un espacio, derivado de umbrales. */
export const SpaceStatus = z.enum(["ok", "warning", "critical", "offline"]);
export type SpaceStatus = z.infer<typeof SpaceStatus>;

/** Epoch en milisegundos (UTC). */
export const EpochMs = z.number().int().nonnegative();

/** Contrato de nombres con Blender/GLB: SPC_<piso>_<codigo>. */
export const MeshId = z.string().regex(/^SPC_\d{1,2}_[A-Z0-9]{2,12}$/);

export const Building = z.object({
  id: z.string(),
  name: z.string(),
  /** true mientras la geometria sea provisional/estimada. */
  geometry_provisional: z.boolean(),
});
export type Building = z.infer<typeof Building>;

export const Floor = z.object({
  id: z.string(),
  building_id: z.string(),
  level: z.number().int(),
  name: z.string(),
});
export type Floor = z.infer<typeof Floor>;

export const Space = z.object({
  id: z.string(),
  floor_id: z.string(),
  level: z.number().int(),
  code: z.string(),
  name: z.string(),
  type: SpaceType,
  capacity: z.number().int().positive(),
  mesh_id: MeshId,
});
export type Space = z.infer<typeof Space>;

export const MetricValues = z.object({
  co2_ppm: z.number().min(0).max(10000),
  temp_c: z.number().min(-30).max(80),
  rh_pct: z.number().min(0).max(100),
  occupancy: z.number().int().min(0).max(5000),
  power_w: z.number().min(0).max(1_000_000),
});
export type MetricValues = z.infer<typeof MetricValues>;
