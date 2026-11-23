import type { CampusResponse } from "@campuspulse/contracts";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DEFAULT_DIMS, PALETTE, type BuildingDims } from "../twin/constants";
import { buildFrameBoxes, buildRoofBoxes, coreBox, type Box } from "../twin/facade";
import { computeLayout } from "../twin/layout";

/*
 * Edificio PROCEDURAL para AR y exportacion GLB. Sin React ni DOM: lo usan la
 * pagina /ar (nivel A) y apps/web/scripts/export-twin-glb.ts (nivel B).
 *
 * Reutiliza las funciones puras de twin/ (layout, facade, constants). Unidades:
 * metros, Y arriba, edificio centrado en X/Z con la base en y = 0. Las
 * dimensiones son ESTIMACIONES provisionales (ver twin/constants.ts); no son
 * mediciones del edificio real.
 *
 * Convencion de nombres: cada volumen de espacio es una malla llamada con el
 * mesh_id del contrato (SPC_<piso>_<codigo>), igual que el GLB de Blender.
 */

export interface CampusModel {
  /** Raiz con estructura + volumenes de espacio. */
  group: Group;
  /** mesh_id -> malla del volumen (material propio, coloreable). */
  spaceMeshes: Map<string, Mesh>;
  /** mesh_id -> space_id del contrato. */
  spaceIdByMesh: Map<string, string>;
  /** Ancho (X) del edificio en metros, para escalar a maqueta. */
  widthM: number;
  /** Libera geometrias y materiales. */
  dispose: () => void;
}

function boxGeometry(b: Box, dy: number): BufferGeometry {
  const g = new BoxGeometry(b.sx, b.sy, b.sz);
  g.translate(b.x, b.y + dy, b.z);
  // Sin UV: no hay texturas, ahorra peso en el GLB.
  g.deleteAttribute("uv");
  return g;
}

function mergedMesh(name: string, boxes: Box[], dys: number[], material: Material): Mesh | null {
  const geoms = boxes.map((b, i) => boxGeometry(b, dys[i] ?? 0));
  if (geoms.length === 0) return null;
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  const mesh = new Mesh(merged, material);
  mesh.name = name;
  return mesh;
}

export function buildCampusModel(campus: CampusResponse, dims: BuildingDims = DEFAULT_DIMS): CampusModel {
  const layout = computeLayout(campus, dims, 0);
  const group = new Group();
  group.name = "CampusPulse360_AR";

  const slabMat = new MeshStandardMaterial({ color: "#3A4C6B", roughness: 0.72, metalness: 0.1 });
  slabMat.name = "MAT_slab";
  const frameMat = new MeshStandardMaterial({ color: "#1C2A45", roughness: 0.4, metalness: 0.5 });
  frameMat.name = "MAT_frame";
  const coreMat = new MeshStandardMaterial({ color: "#26385A", roughness: 0.6, metalness: 0.2 });
  coreMat.name = "MAT_core";
  const baseMat = new MeshStandardMaterial({ color: "#10192B", roughness: 0.9, metalness: 0 });
  baseMat.name = "MAT_plinth";

  const { footprintW: W, footprintD: D, floorHeight, slab } = dims;
  const slabs: Box[] = [];
  const slabY: number[] = [];
  const frames: Box[] = [];
  const frameY: number[] = [];
  const cores: Box[] = [];
  const coreY: number[] = [];

  const frameLocal = buildFrameBoxes(dims);
  const coreLocal = coreBox(dims);
  for (const f of layout.floors) {
    slabs.push({ x: 0, y: slab / 2, z: 0, sx: W + 0.5, sy: slab, sz: D + 0.5 });
    slabY.push(f.y);
    for (const b of frameLocal) {
      frames.push(b);
      frameY.push(f.y);
    }
    cores.push(coreLocal);
    coreY.push(f.y);
  }
  const top = layout.floors[layout.floors.length - 1]?.y ?? 0;
  slabs.push({ x: 0, y: floorHeight + slab / 2, z: 0, sx: W + 0.5, sy: slab, sz: D + 0.5 });
  slabY.push(top);
  for (const b of buildRoofBoxes(dims)) {
    frames.push(b);
    frameY.push(top);
  }

  for (const m of [
    mergedMesh("STRUCT_SLABS", slabs, slabY, slabMat),
    mergedMesh("STRUCT_FRAME", frames, frameY, frameMat),
    mergedMesh("STRUCT_CORE", cores, coreY, coreMat),
  ]) {
    if (m) group.add(m);
  }

  const plinth = new Mesh(new BoxGeometry(W + 2 * dims.plinthMargin, dims.plinthH, D + 2 * dims.plinthMargin), baseMat);
  plinth.name = "STRUCT_PLINTH";
  plinth.position.y = -dims.plinthH / 2;
  group.add(plinth);

  const spaceMeshes = new Map<string, Mesh>();
  const spaceIdByMesh = new Map<string, string>();
  const floorY = new Map(layout.floors.map((f) => [f.level, f.y]));
  const okColor = new Color(PALETTE.cyan);
  for (const s of layout.spaces) {
    const mat = new MeshStandardMaterial({
      color: okColor,
      emissive: okColor,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      metalness: 0.05,
    });
    mat.name = `MAT_${s.meshId}`;
    const mesh = new Mesh(new BoxGeometry(s.w, s.h, s.d), mat);
    mesh.name = s.meshId;
    mesh.position.set(s.x, (floorY.get(s.level) ?? 0) + s.y, s.z);
    mesh.userData["spaceId"] = s.id;
    group.add(mesh);
    spaceMeshes.set(s.meshId, mesh);
    spaceIdByMesh.set(s.meshId, s.id);
  }

  const dispose = () => {
    group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
      }
    });
  };

  return { group, spaceMeshes, spaceIdByMesh, widthM: W, dispose };
}

/** Pinta cada volumen con su color (hex). mesh_id sin dato -> gris "offline" lo decide quien llama. */
export function applySpaceColors(model: CampusModel, colors: ReadonlyMap<string, string>): void {
  for (const [meshId, mesh] of model.spaceMeshes) {
    const hex = colors.get(meshId);
    if (!hex) continue;
    const mat = mesh.material as MeshStandardMaterial;
    mat.color.set(hex);
    mat.emissive.set(hex);
  }
}
