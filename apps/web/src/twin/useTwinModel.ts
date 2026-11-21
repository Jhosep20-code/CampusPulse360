import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Box3, type Mesh, type Object3D } from "three";
import { FLOOR_NODE_PREFIX, MODEL_URL, SPACE_MESH_PREFIX } from "./constants";

/** Resultado de cargar el GLB de Blender (ver assets/3d/README.md). */
export interface TwinModel {
  /** Fachada/estructura: todo lo que NO es una malla SPC_*. */
  facade: Object3D;
  /** mesh_id -> malla de volumen de espacio (transformacion ya en coordenadas de mundo). */
  spaces: Map<string, Mesh>;
  /** Nivel -> nodos de fachada FLR_<nivel>_* que acompanan la vista explotada. */
  floorNodes: Map<number, Object3D[]>;
  /** Caja envolvente de fachada + espacios. */
  bounds: Box3;
}

const SPACE_NAME = /^SPC_\d{1,2}_[A-Z0-9]{2,12}$/;

function isMesh(o: Object3D): o is Mesh {
  return (o as Mesh).isMesh === true;
}

/** Quita sufijos de duplicado de Blender ("SPC_3_A301.001" -> "SPC_3_A301"). */
function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}

/**
 * Separa un GLB cargado en fachada y volumenes de espacio. Funcion sin React para
 * poder reutilizarla en pruebas cuando exista un modelo.
 */
export function splitModel(scene: Object3D): TwinModel {
  const root = scene.clone(true);
  root.updateMatrixWorld(true);

  const found: Mesh[] = [];
  root.traverse((o) => {
    if (isMesh(o) && o.name.startsWith(SPACE_MESH_PREFIX) && SPACE_NAME.test(baseName(o.name))) {
      found.push(o);
    }
  });

  const spaces = new Map<string, Mesh>();
  for (const m of found) {
    // Conserva la transformacion de mundo al sacar la malla de su padre.
    const world = m.matrixWorld.clone();
    m.removeFromParent();
    world.decompose(m.position, m.quaternion, m.scale);
    m.name = baseName(m.name);
    spaces.set(m.name, m);
  }

  const floorNodes = new Map<number, Object3D[]>();
  for (const child of [...root.children]) {
    const match = new RegExp(`^${FLOOR_NODE_PREFIX}(\\d{1,2})(?:_|$)`).exec(child.name);
    if (match?.[1]) {
      const level = Number.parseInt(match[1], 10);
      child.removeFromParent();
      const list = floorNodes.get(level) ?? [];
      list.push(child);
      floorNodes.set(level, list);
    }
  }

  const bounds = new Box3().setFromObject(root);
  for (const nodes of floorNodes.values()) for (const n of nodes) bounds.expandByObject(n);
  for (const m of spaces.values()) bounds.expandByObject(m);
  return { facade: root, spaces, floorNodes, bounds };
}

/** Carga real: solo se invoca cuando MODEL_URL es una ruta (constante de modulo, estable entre renders). */
function useLoadedModel(url: string): TwinModel {
  // Draco desactivado a proposito: su decodificador por defecto se descarga de un CDN externo.
  // Los GLB se exportan con Meshopt, cuyo decodificador viene empaquetado.
  const gltf = useGLTF(url, false, true);
  return useMemo(() => splitModel(gltf.scene), [gltf.scene]);
}

/**
 * Si MODEL_URL es null devuelve null y el gemelo usa la geometria procedural.
 * MODEL_URL es una constante de modulo, por lo que el orden de hooks es estable.
 */
export function useTwinModel(): TwinModel | null {
  if (MODEL_URL === null) return null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useLoadedModel(MODEL_URL);
}
