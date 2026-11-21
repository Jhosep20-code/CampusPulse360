import type { CampusResponse } from "@campuspulse/contracts";
import { DEFAULT_DIMS, type BuildingDims } from "./constants";

/**
 * Distribucion PROVISIONAL de espacios dentro de cada piso. Funcion pura.
 * Todas las coordenadas son ESTIMACIONES del prototipo (ver constants.ts).
 *
 * Ejes: Y arriba, metros, edificio centrado en X/Z. Las posiciones de espacio
 * son locales al origen del piso (cara inferior de la losa).
 * Planta: pasillo central a lo largo de X; una fila de espacios al sur (z>0) y
 * otra al norte (z<0); el nucleo de circulacion ocupa el extremo este.
 */

export interface SpaceBox {
  id: string;
  meshId: string;
  level: number;
  /** 0 = fila sur (z>0), 1 = fila norte (z<0). */
  row: 0 | 1;
  /** Centro del volumen, local al origen del piso. */
  x: number;
  y: number;
  z: number;
  /** Tamano en X, Y, Z. */
  w: number;
  h: number;
  d: number;
}

export interface FloorLayout {
  level: number;
  /** Posicion en la pila (0 = planta baja). */
  index: number;
  /** Origen Y del piso en el mundo, segun exploded. */
  y: number;
  spaceIds: string[];
}

export interface TwinLayout {
  floors: FloorLayout[];
  spaces: SpaceBox[];
  byId: Map<string, SpaceBox>;
  /** 0 = compacto, 1 = explotado. */
  exploded: number;
  /** Caja envolvente del edificio (incluye losa de cubierta y parapeto). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

/** Niveles del campus en orden ascendente (union de pisos y espacios). */
export function floorLevels(campus: CampusResponse): number[] {
  const set = new Set<number>();
  for (const f of campus.floors) set.add(f.level);
  for (const s of campus.spaces) set.add(s.level);
  return [...set].sort((a, b) => a - b);
}

/** Origen Y de un piso dada la fraccion de explosion (0..1). */
export function floorOriginY(index: number, dims: BuildingDims, exploded: number): number {
  return index * (dims.floorHeight + dims.explodeGap * exploded);
}

/** Rango X util para los volumenes de espacio (entre fachada oeste y nucleo). */
export function spaceXRange(dims: BuildingDims): { min: number; max: number } {
  return {
    min: -dims.footprintW / 2 + dims.wallInset,
    max: dims.footprintW / 2 - dims.wallInset - dims.coreW - dims.spaceGap * 2,
  };
}

export function computeLayout(
  campus: CampusResponse,
  dims: BuildingDims = DEFAULT_DIMS,
  exploded: boolean | number = false,
): TwinLayout {
  const t = typeof exploded === "boolean" ? (exploded ? 1 : 0) : Math.min(1, Math.max(0, exploded));
  const levels = floorLevels(campus);
  const xr = spaceXRange(dims);
  const usableLen = xr.max - xr.min;
  const rowDepth = (dims.footprintD - 2 * dims.wallInset - dims.corridorW) / 2;
  const spaceH = dims.floorHeight - dims.slab - dims.headroom;

  const floors: FloorLayout[] = [];
  const spaces: SpaceBox[] = [];

  levels.forEach((level, index) => {
    const inFloor = campus.spaces
      .filter((s) => s.level === level)
      .sort((a, b) => a.code.localeCompare(b.code));
    // Reparto alterno entre fila sur y norte.
    const south: typeof inFloor = [];
    const north: typeof inFloor = [];
    inFloor.forEach((s, i) => (i % 2 === 0 ? south : north).push(s));

    const place = (list: typeof inFloor, row: 0 | 1) => {
      const n = list.length;
      if (n === 0) return;
      const len = (usableLen - dims.spaceGap * (n - 1)) / n;
      const zc = (row === 0 ? 1 : -1) * (dims.corridorW / 2 + rowDepth / 2);
      list.forEach((s, i) => {
        spaces.push({
          id: s.id,
          meshId: s.mesh_id,
          level,
          row,
          x: xr.min + len / 2 + i * (len + dims.spaceGap),
          y: dims.slab + spaceH / 2,
          z: zc,
          w: len,
          h: spaceH,
          d: rowDepth - 0.2,
        });
      });
    };
    place(south, 0);
    place(north, 1);

    floors.push({
      level,
      index,
      y: floorOriginY(index, dims, t),
      spaceIds: inFloor.map((s) => s.id),
    });
  });

  const n = Math.max(1, floors.length);
  const top = floorOriginY(n - 1, dims, t) + dims.floorHeight + dims.slab + dims.parapetH;
  return {
    floors,
    spaces,
    byId: new Map(spaces.map((s) => [s.id, s])),
    exploded: t,
    bounds: {
      minX: -dims.footprintW / 2,
      maxX: dims.footprintW / 2,
      minY: 0,
      maxY: top,
      minZ: -dims.footprintD / 2,
      maxZ: dims.footprintD / 2,
    },
  };
}
