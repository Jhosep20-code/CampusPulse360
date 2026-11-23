import type { CampusResponse } from "@campuspulse/contracts";
import { DEFAULT_DIMS, TWIN_LEVELS, type BuildingDims } from "./constants";

/**
 * Distribucion ESTIMADA de espacios por piso (docs/referencias/especificacion-3d.md,
 * tabla 6). Funcion pura; todas las cifras son estimaciones, no mediciones.
 *
 * Ejes: Y arriba, metros, edificio centrado en X/Z, fachada principal (vidrio) hacia +Z.
 * Las posiciones de espacio son locales al origen del piso (cara inferior de la losa).
 * Planta: atrio central rodeado por un pasillo perimetral, nucleo de 3 ascensores
 * pegado al atrio por el este, y una fila de espacios al frente (+Z) y otra al fondo (-Z).
 */

export interface SpaceBox {
  id: string;
  meshId: string;
  level: number;
  /** 0 = fila frontal (+Z, vidrio), 1 = fila de fondo (-Z). */
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
  /** Origen Y compacto (sin explosion). */
  baseY: number;
  /** Altura del piso (la planta baja es mas alta). */
  height: number;
  spaceIds: string[];
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TwinLayout {
  floors: FloorLayout[];
  spaces: SpaceBox[];
  byId: Map<string, SpaceBox>;
  /** 0 = compacto, 1 = explotado. */
  exploded: number;
  /** Caja envolvente del edificio (incluye coronacion, caja tecnica y marquesina). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

/** Fila (0 = frente +Z, 1 = fondo -Z) de los 10 espacios instrumentados (tabla 6 de la especificacion). */
export const ROW_BY_SPACE: Readonly<Record<string, 0 | 1>> = {
  SPC_1_LOBBY: 0,
  SPC_1_BIB: 1,
  SPC_2_A201: 0,
  SPC_2_A202: 1,
  SPC_3_A301: 0,
  SPC_3_LAB1: 1,
  SPC_4_A401: 0,
  SPC_4_LAB2: 1,
  SPC_5_OFI: 0,
  SPC_5_AUD: 1,
};

/** Niveles en orden ascendente: P1..P10 siempre, mas cualquier nivel extra del campus. */
export function floorLevels(campus: CampusResponse): number[] {
  const set = new Set<number>(TWIN_LEVELS);
  for (const f of campus.floors) set.add(f.level);
  for (const s of campus.spaces) set.add(s.level);
  return [...set].sort((a, b) => a - b);
}

/** Altura de un piso por posicion en la pila: la planta baja (0) es mas alta. */
export function levelHeight(index: number, dims: BuildingDims): number {
  return index === 0 ? dims.groundFloorHeight : dims.floorHeight;
}

/** Origen Y compacto de un piso por posicion en la pila. */
export function levelBaseY(index: number, dims: BuildingDims): number {
  return index <= 0 ? 0 : dims.groundFloorHeight + (index - 1) * dims.floorHeight;
}

/** Origen Y de un piso dada la fraccion de explosion (0..1). */
export function floorOriginY(index: number, dims: BuildingDims, exploded: number): number {
  return levelBaseY(index, dims) + index * dims.explodeGap * exploded;
}

/** Vacio del atrio en planta (coordenadas de edificio). */
export function atriumRect(dims: BuildingDims): Rect {
  return {
    minX: dims.atriumX - dims.atriumW / 2,
    maxX: dims.atriumX + dims.atriumW / 2,
    minZ: -dims.atriumD / 2,
    maxZ: dims.atriumD / 2,
  };
}

/** Nucleo de 3 ascensores: pegado al atrio por el este. */
export function coreRect(dims: BuildingDims): Rect {
  const a = atriumRect(dims);
  return { minX: a.maxX, maxX: a.maxX + dims.coreW, minZ: -dims.coreD / 2, maxZ: dims.coreD / 2 };
}

/** Semidistancia en Z desde el eje hasta el borde exterior del pasillo perimetral. */
export function corridorOuterZ(dims: BuildingDims): number {
  return dims.atriumD / 2 + dims.corridorW;
}

/** Rango X util para los volumenes de espacio (entre muros). */
export function spaceXRange(dims: BuildingDims): { min: number; max: number } {
  return { min: -dims.footprintW / 2 + dims.wallInset, max: dims.footprintW / 2 - dims.wallInset };
}

/** Altura total hasta la coronacion (sin caja tecnica). */
export function crownTopY(floorCount: number, dims: BuildingDims): number {
  const n = Math.max(1, floorCount);
  return levelBaseY(n - 1, dims) + levelHeight(n - 1, dims) + dims.crownH;
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
  const gap = 0.1;
  const inner = corridorOuterZ(dims) + gap;
  const frontZ = { min: inner, max: dims.footprintD / 2 - dims.frontSetback };
  const backZ = { min: -(dims.footprintD / 2 - dims.wallInset), max: -inner };

  const floors: FloorLayout[] = [];
  const spaces: SpaceBox[] = [];

  levels.forEach((level, index) => {
    const height = levelHeight(index, dims);
    const spaceH = height - dims.slab - dims.headroom;
    const inFloor = campus.spaces
      .filter((s) => s.level === level)
      .sort((a, b) => a.code.localeCompare(b.code));

    const front: typeof inFloor = [];
    const back: typeof inFloor = [];
    const unknown: typeof inFloor = [];
    for (const s of inFloor) {
      const row = ROW_BY_SPACE[s.id];
      if (row === 0) front.push(s);
      else if (row === 1) back.push(s);
      else unknown.push(s);
    }
    // Espacios fuera de la tabla 6: se reparten hacia la fila con menos espacios.
    for (const s of unknown) (front.length <= back.length ? front : back).push(s);
    front.sort((a, b) => a.code.localeCompare(b.code));
    back.sort((a, b) => a.code.localeCompare(b.code));

    const place = (list: typeof inFloor, row: 0 | 1) => {
      const n = list.length;
      if (n === 0) return;
      const z = row === 0 ? frontZ : backZ;
      const len = (usableLen - dims.spaceGap * (n - 1)) / n;
      list.forEach((s, i) => {
        spaces.push({
          id: s.id,
          meshId: s.mesh_id,
          level,
          row,
          x: xr.min + len / 2 + i * (len + dims.spaceGap),
          y: dims.slab + spaceH / 2,
          z: (z.min + z.max) / 2,
          w: len,
          h: spaceH,
          d: z.max - z.min,
        });
      });
    };
    place(front, 0);
    place(back, 1);

    floors.push({
      level,
      index,
      y: floorOriginY(index, dims, t),
      baseY: levelBaseY(index, dims),
      height,
      spaceIds: inFloor.map((s) => s.id),
    });
  });

  const n = Math.max(1, floors.length);
  const crown = floorOriginY(n - 1, dims, t) + levelHeight(n - 1, dims) + dims.crownH;
  const roofBoxTop =
    floorOriginY(n - 1, dims, t) + levelHeight(n - 1, dims) + dims.slab + dims.roofBoxH;
  return {
    floors,
    spaces,
    byId: new Map(spaces.map((s) => [s.id, s])),
    exploded: t,
    bounds: {
      minX: -dims.footprintW / 2,
      maxX: dims.footprintW / 2,
      minY: 0,
      maxY: Math.max(crown, roofBoxTop),
      minZ: -dims.footprintD / 2,
      maxZ: dims.footprintD / 2 + dims.marqueeD - 0.3,
    },
  };
}
