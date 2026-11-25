import { Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from "three";
import { effectivelyVisible, type GlbModel } from "./glbBuild";

/*
 * Estado en ejecucion del modelo GLB: aislamiento, explosion e inspector de pruebas.
 * REGLA: aislar = group.visible; explotar = position.y. Este archivo no toca ninguna
 * escala ni matriz de instancia (ver instancing.ts y la prueba glbBuild.test.ts).
 */

export interface FloorState {
  /** Nivel aislado (null = todos). */
  isolatedLevel: number | null;
  /** Avance de la explosion, 0..1. */
  explode: number;
  /** Separacion extra por piso (m). */
  gap: number;
  /** true = se dibuja por pisos (aislado o explotado); false = edificio completo fusionado. */
  floorMode: boolean;
}

/** El modo por pisos se necesita al aislar, al explotar o mientras se pliega la explosion. */
export function floorModeActive(isolatedLevel: number | null, exploded: boolean, explodeT: number): boolean {
  return isolatedLevel !== null || exploded || explodeT > 0.002;
}

export function applyFloorState(model: GlbModel, s: FloorState): void {
  model.whole.visible = !s.floorMode;
  for (const fl of model.floors.values()) {
    const dy = s.explode * fl.index * s.gap;
    fl.group.position.y = dy;
    fl.group.visible = s.isolatedLevel === null || s.isolatedLevel === fl.level;
    for (const m of fl.parts) {
      // Con un piso aislado se quita su falso cielo para ver los espacios desde arriba (es un nodo, no una escala).
      // Tambien la cubierta (fusionada en el ultimo piso) se oculta al aislar: si no, tapa P10.
      const openTop = s.isolatedLevel !== null && (m.userData["material"] === "CEILING" || m.userData["part"] === "roof");
      m.visible = s.floorMode && !openTop;
      m.userData["swapHidden"] = !s.floorMode;
    }
    // Las rebanadas compartidas se recortan a la franja del piso, ya desplazada por la explosion.
    fl.lo.constant = -(fl.range.lo + (fl.range.lo <= -1000 ? 0 : dy));
    fl.hi.constant = fl.range.hi + (fl.range.hi >= 1000 ? 0 : dy);
  }
}

/** Brillo de las ventanas de cada espacio por ocupacion (0..1). */
export function applyWindowGlow(model: GlbModel, kBySpaceMesh: ReadonlyMap<string, number>): void {
  for (const id of model.mats.windowSpace.keys()) model.mats.setWindowGlow(id, kBySpaceMesh.get(id) ?? 0);
}

/* ------------------------------------------------------------ inspector */

const M = new Matrix4();
const P = new Vector3();
const Q = new Quaternion();
const S = new Vector3();

/** Mallas con escala nula en algun eje pero no en todos (causa de las "losas negras"). */
export function countDegenerate(roots: Iterable<Object3D>): number {
  let n = 0;
  for (const r of roots) {
    r.updateWorldMatrix(true, true);
    r.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      M.copy(o.matrixWorld).decompose(P, Q, S);
      const zeros = [S.x, S.y, S.z].filter((v) => Math.abs(v) < 1e-6).length;
      if (zeros > 0 && zeros < 3) n++;
    });
  }
  return n;
}

/**
 * Mallas visibles (visible efectivo de toda la cadena de padres) bajo cada FLOOR_Pxx. El
 * cambio de dibujo "edificio completo <-> por pisos" no cuenta: se cuenta lo que ese piso
 * mostraria; renderMode lo indica aparte.
 */
export function visibleByLevel(model: GlbModel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fl of model.floors.values()) {
    let n = 0;
    fl.group.traverse((o) => {
      if (!(o as Mesh).isMesh || o.userData["spaceMeshId"] !== undefined) return;
      if (effectivelyVisible(o, true)) n++;
    });
    out[String(fl.level)] = n;
  }
  return out;
}

export function glbDebugSnapshot(model: GlbModel): {
  visibleByLevel: Record<string, number>;
  degenerate: number;
  renderMode: "whole" | "floors";
  stats: GlbModel["stats"];
} {
  return {
    visibleByLevel: visibleByLevel(model),
    degenerate: countDegenerate([model.whole, ...[...model.floors.values()].map((f) => f.group)]),
    renderMode: model.whole.visible ? "whole" : "floors",
    stats: model.stats,
  };
}
