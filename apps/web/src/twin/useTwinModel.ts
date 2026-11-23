import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { Plane } from "three";
import { buildContextModel, buildGlbModel, type ContextModel, type GlbModel } from "./glbBuild";
import type { FloorBand } from "./glb";

/** Resultado de cargar el GLB de Blender (ver assets/3d/README.md). */
export type TwinModel = GlbModel;

/**
 * Carga el GLB del edificio. Draco desactivado a proposito: los GLB no lo usan y su
 * decodificador por defecto se descarga de un CDN externo (prohibido). Meshopt tampoco
 * hace falta (los GLB se exportan sin compresion). Si la carga falla, useGLTF lanza el
 * error y el ErrorBoundary de CampusTwin pasa a la geometria procedural.
 */
export function useTwinModel(url: string, bands: readonly FloorBand[], clip: Plane, shadows: boolean): TwinModel {
  const gltf = useGLTF(url, false, false);
  const bandsKey = bands.map((b) => `${b.level}:${b.baseY}:${b.height}`).join("|");
  const model = useMemo(
    () => buildGlbModel(gltf.scene, { bands, clip, shadows }),
    // bands se resume en bandsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gltf.scene, bandsKey, clip, shadows],
  );
  useEffect(() => {
    return () => {
      model.dispose();
    };
  }, [model]);
  return model;
}

/** Contexto urbano opcional (utp-context.glb). */
export function useContextModel(url: string, profile: "high" | "low", shadows: boolean): ContextModel {
  const gltf = useGLTF(url, false, false);
  const model = useMemo(() => buildContextModel(gltf.scene, profile, shadows), [gltf.scene, profile, shadows]);
  useEffect(() => {
    return () => {
      model.dispose();
    };
  }, [model]);
  return model;
}
