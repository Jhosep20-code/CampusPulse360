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
import { BATCH_KEYS, BATCH_META, buildBuilding, type Box } from "../twin/facade";
import { computeLayout } from "../twin/layout";
import { MATERIAL_SPECS } from "../twin/materials";

/*
 * Edificio PROCEDURAL para AR y exportacion GLB. Sin React ni DOM: lo usan la
 * pagina /ar (nivel A) y apps/web/scripts/export-twin-glb.ts (nivel B).
 *
 * Reutiliza las funciones puras de twin/ (layout, facade, materials, constants):
 * el mismo edificio de 10 pisos del gemelo, una malla fusionada por material, sin
 * entorno (contexto urbano, valla, cerros). Unidades: metros, Y arriba, edificio
 * centrado en X/Z con la base en y = 0. Las dimensiones son ESTIMACIONES basadas en
 * fotografia (twin/constants.ts); no son mediciones ni planos verificados.
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
  const building = buildBuilding(dims, layout, "none", false);
  const group = new Group();
  group.name = "CampusPulse360_AR";

  for (const key of BATCH_KEYS) {
    if (BATCH_META[key].env) continue;
    const spec = MATERIAL_SPECS[key];
    const boxes = building.boxes[key];
    const opacity = spec.opacityAr;
    const mat = new MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: opacity < 0.999,
      opacity,
      depthWrite: opacity >= 0.999,
      ...(key === "led" ? { emissive: new Color("#FFFFFF"), emissiveIntensity: 0.9 } : {}),
    });
    mat.name = `MAT_${key}`;
    const mesh = mergedMesh(`STRUCT_${key.toUpperCase()}`, boxes, boxes.map(() => 0), mat);
    if (mesh) group.add(mesh);
    else mat.dispose();
  }

  const { footprintW: W, footprintD: D } = dims;
  const baseMat = new MeshStandardMaterial({ color: "#10192B", roughness: 0.9, metalness: 0 });
  baseMat.name = "MAT_plinth";
  const frontExtra = dims.marqueeD + 0.5;
  const plinth = new Mesh(new BoxGeometry(W + 3, 0.6, D + 1.5 + frontExtra), baseMat);
  plinth.name = "STRUCT_PLINTH";
  plinth.position.set(0, -0.3, (frontExtra - 1.5) / 2);
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
