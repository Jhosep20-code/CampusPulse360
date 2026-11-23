import type { CampusResponse } from "@campuspulse/contracts";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLB_PATH } from "./logic";
import { DEFAULT_DIMS, PALETTE, type BuildingDims } from "../twin/constants";
import { BATCH_KEYS, BATCH_META, buildBuilding, type Box } from "../twin/facade";
import { computeLayout } from "../twin/layout";
import { MATERIAL_SPECS } from "../twin/materials";

/*
 * Edificio PROCEDURAL para AR y exportacion GLB. Sin React ni DOM: lo usan la
 * pagina /ar (nivel A) como respaldo si el GLB de Blender no carga.
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

function boxGeometry(b: Box & { rx?: number; ry?: number }, dy: number): BufferGeometry {
  const g = new BoxGeometry(b.sx, b.sy, b.sz);
  g.translate(b.x, b.y + dy, b.z);
  // Sin UV: no hay texturas, ahorra peso en el GLB.
  g.deleteAttribute("uv");
  return g;
}

function mergedMesh(name: string, boxes: Array<Box & { rx?: number; ry?: number }>, dys: number[], material: Material): Mesh | null {
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
    if (!BATCH_META[key].ar) continue;
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

/**
 * Nivel A con el modelo REAL de Blender (utp-huancayo-ar.glb, el mismo de Scene Viewer) cargado con GLTFLoader
 * de three (sin Draco ni dependencias nuevas). Cada SPC_* pasa a ser un volumen semitransparente
 * coloreable con material propio; los emisivos se bajan (en AR no hay noche). Si la carga falla
 * lanza el error y quien llama usa buildCampusModel (geometria procedural).
 */
export async function loadGlbCampusModel(campus: CampusResponse, url: string = GLB_PATH): Promise<CampusModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const group = new Group();
  group.name = "CampusPulse360_AR_GLB";
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  group.add(root);

  const idByMesh = new Map(campus.spaces.map((s) => [s.mesh_id, s.id]));
  const spaceMeshes = new Map<string, Mesh>();
  const spaceIdByMesh = new Map<string, string>();
  const okColor = new Color(PALETTE.cyan);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    if (/^SPC_\d{1,2}_[A-Z0-9]{2,12}$/.test(m.name)) {
      const mat = new MeshStandardMaterial({
        color: okColor,
        emissive: okColor,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      mat.name = `MAT_${m.name}`;
      m.material = mat;
      m.renderOrder = 2;
      const id = idByMesh.get(m.name);
      if (id) {
        m.userData["spaceId"] = id;
        spaceMeshes.set(m.name, m);
        spaceIdByMesh.set(m.name, id);
      }
      return;
    }
    const mat = m.material as MeshStandardMaterial;
    if (mat.name === "WINDOW_NIGHT") mat.emissiveIntensity = 0;
    else if (mat.name === "LED_CROWN") mat.emissiveIntensity = 0.9;
    else if (mat.name === "LIGHT_PANEL") mat.emissiveIntensity = 0.2;
  });

  const dispose = () => {
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
    });
  };
  // El GLB de AR viene a escala de maqueta: el ancho real se mide (frente X de la caja) para que el control de tamano
  // de la AR (metros de maqueta) siga funcionando con cualquier escala de exportacion.
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  const widthM = Number.isFinite(size.x) && size.x > 0 ? size.x : DEFAULT_DIMS.footprintW;
  return { group, spaceMeshes, spaceIdByMesh, widthM, dispose };
}

/** GLB de Blender si se puede cargar; si no, edificio procedural (nivel A siempre funciona). */
export async function loadCampusModel(campus: CampusResponse): Promise<{ model: CampusModel; source: "glb" | "procedural" }> {
  try {
    return { model: await loadGlbCampusModel(campus), source: "glb" };
  } catch (e) {
    console.warn("[ar] No se pudo cargar el GLB; se usa el edificio procedural.", e);
    return { model: buildCampusModel(campus), source: "procedural" };
  }
}
