import type { CampusResponse, LiveSpace, Space } from "@campuspulse/contracts";
import {
  CameraControls,
  Environment,
  Grid,
  Html,
  Lightformer,
  PerformanceMonitor,
} from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Component,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
} from "three";
import { describeSpaces, describeTwin, liveBySpaceId } from "./a11y";
import { STATUS_LABEL, colorForSpace, emissiveForNight, primaryValueLabel } from "./colors";
import { DEFAULT_DIMS, MODEL_URL, PALETTE, type BuildingDims } from "./constants";
import {
  buildFrameBoxes,
  buildRoofBoxes,
  buildWindowPanes,
  coreBox,
  type Box,
  type WindowPane,
} from "./facade";
import { computeLayout, floorLevels } from "./layout";
import type { TwinLayer, TwinProps } from "./types";
import { initialViewFromBox } from "./view";
import { useTwinModel, type TwinModel } from "./useTwinModel";

/*
 * Gemelo 3D de CampusPulse 360.
 * La geometria procedural es PROVISIONAL (dimensiones estimadas, ver constants.ts);
 * se sustituira por un GLB de Blender sin tocar este codigo (ver MODEL_URL).
 */

const DIMS: BuildingDims = DEFAULT_DIMS;
const DPR_HIGH: [number, number] = [1, 2];
const DPR_LOW: [number, number] = [1, 1.25];
const WARM_WINDOW = new Color("#FFD9A0");
const DUMMY = new Object3D();
const noRaycast: Mesh["raycast"] = () => {};

/* ------------------------------------------------------------------ tipos */

type Vec3 = [number, number, number];

interface SpaceGeom {
  space: Space;
  level: number;
  /** Centro: local al piso (procedural) o de mundo (GLB). */
  pos: Vec3;
  size: Vec3;
  /** Malla del GLB; ausente en geometria procedural. */
  mesh?: Mesh;
  panes: WindowPane[];
}

interface FloorInfo {
  level: number;
  index: number;
  /** Origen Y compacto y explotado. */
  y0: number;
  y1: number;
  geoms: SpaceGeom[];
}

interface Resources {
  box: BoxGeometry;
  plane: PlaneGeometry;
  ground: CircleGeometry;
  edges: EdgesGeometry;
  lineSelected: LineBasicMaterial;
  lineHover: LineBasicMaterial;
  groundMat: MeshStandardMaterial;
  plinthMat: MeshStandardMaterial;
}

interface SceneCtx {
  res: Resources;
  procedural: boolean;
  model: TwinModel | null;
  layer: TwinLayer;
  liveMap: Map<string, LiveSpace>;
  selectedId: string | null;
  hoveredId: string | null;
  night: boolean;
  reduced: boolean;
  exploded: boolean;
  isolatedLevel: number | null;
  shadows: boolean;
  floorCount: number;
  frameBoxes: Box[];
  roofBoxes: Box[];
  core: Box;
  setHovered: (id: string | null) => void;
  select: (id: string | null) => void;
}

const Ctx = createContext<SceneCtx | null>(null);
/**
 * Contenedor DOM propio para las etiquetas <Html> de drei. Sin el, drei inserta
 * nodos dentro del div que React gestiona para el Canvas y, al desmontar (cambio
 * de ruta), React lanza "removeChild ... not a child of this node".
 */
const OverlayCtx = createContext<RefObject<HTMLDivElement | null> | null>(null);
function useCtx(): SceneCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("CampusTwin: contexto de escena ausente");
  return c;
}

/* ------------------------------------------------------------------ hooks */

const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(RM_QUERY).matches
    : false;
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

/* ------------------------------------------------------------ construccion */

function buildSceneModel(
  campus: CampusResponse,
  model: TwinModel | null,
  dims: BuildingDims,
): { floors: FloorInfo[]; bounds: Box3 } {
  if (!model) {
    const compact = computeLayout(campus, dims, 0);
    const exploded = computeLayout(campus, dims, 1);
    const byId = new Map(campus.spaces.map((s) => [s.id, s]));
    const floors: FloorInfo[] = compact.floors.map((f, i) => {
      const geoms: SpaceGeom[] = [];
      for (const box of compact.spaces) {
        const space = byId.get(box.id);
        if (box.level !== f.level || !space) continue;
        geoms.push({
          space,
          level: f.level,
          pos: [box.x, box.y, box.z],
          size: [box.w, box.h, box.d],
          panes: buildWindowPanes(box, dims),
        });
      }
      return { level: f.level, index: f.index, y0: f.y, y1: exploded.floors[i]?.y ?? f.y, geoms };
    });
    const b = compact.bounds;
    const m = dims.plinthMargin;
    // El sobrerrecorrido del nucleo y los equipos sobresalen del parapeto: se incluyen en el encuadre.
    const topFloorY = b.maxY - (dims.floorHeight + dims.slab + dims.parapetH);
    const roofTop = topFloorY + Math.max(...buildRoofBoxes(dims).map((r) => r.y + r.sy / 2));
    return {
      floors,
      bounds: new Box3(
        new Vector3(b.minX - m, -dims.plinthH, b.minZ - m),
        new Vector3(b.maxX + m, Math.max(b.maxY, roofTop), b.maxZ + m),
      ),
    };
  }
  // Modelo GLB: las mallas ya estan en coordenadas de mundo; el piso solo aporta el desplazamiento.
  const floors: FloorInfo[] = floorLevels(campus).map((level, index) => {
    const geoms: SpaceGeom[] = [];
    for (const space of campus.spaces) {
      const mesh = model.spaces.get(space.mesh_id);
      if (space.level !== level || !mesh) continue;
      const box = new Box3().setFromObject(mesh);
      const c = box.getCenter(new Vector3());
      const s = box.getSize(new Vector3());
      geoms.push({ space, level, pos: [c.x, c.y, c.z], size: [s.x, s.y, s.z], mesh, panes: [] });
    }
    return { level, index, y0: 0, y1: index * dims.explodeGap, geoms };
  });
  return { floors, bounds: model.bounds.clone() };
}

/** Caja de mundo de un conjunto de espacios segun el estado de explosion destino. */
function spacesWorldBox(floors: FloorInfo[], ids: Set<string>, exploded: boolean): Box3 {
  const box = new Box3();
  for (const f of floors) {
    const dy = exploded ? f.y1 : f.y0;
    for (const g of f.geoms) {
      if (!ids.has(g.space.id)) continue;
      const c = new Vector3(g.pos[0], g.pos[1] + dy, g.pos[2]);
      const half = new Vector3(g.size[0] / 2, g.size[1] / 2, g.size[2] / 2);
      box.expandByPoint(c.clone().sub(half));
      box.expandByPoint(c.clone().add(half));
    }
  }
  return box;
}

/* ------------------------------------------------------------ instancias */

function BoxInstances({
  boxes,
  material,
  castShadow = false,
}: {
  boxes: Box[];
  material: Material;
  castShadow?: boolean;
}) {
  const { res } = useCtx();
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    boxes.forEach((b, i) => {
      DUMMY.position.set(b.x, b.y, b.z);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(b.sx, b.sy, b.sz);
      DUMMY.updateMatrix();
      im.setMatrixAt(i, DUMMY.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  }, [boxes]);
  return (
    <instancedMesh
      ref={ref}
      args={[res.box, material, boxes.length]}
      frustumCulled={false}
      castShadow={castShadow}
      raycast={noRaycast}
    />
  );
}

/** Ventanas del modo noche: una InstancedMesh por piso, color por panel segun ocupacion. */
function WindowInstances({ geoms, material }: { geoms: SpaceGeom[]; material: Material }) {
  const { res, liveMap, night } = useCtx();
  const ref = useRef<InstancedMesh>(null);
  const panes = useMemo(
    () => geoms.flatMap((g) => g.panes.map((p) => ({ p, spaceId: g.space.id, cap: g.space.capacity }))),
    [geoms],
  );

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    panes.forEach(({ p }, i) => {
      DUMMY.position.set(p.x, p.y, p.z);
      DUMMY.rotation.set(0, p.facing === 1 ? 0 : Math.PI, 0);
      DUMMY.scale.set(p.w, p.h, 1);
      DUMMY.updateMatrix();
      im.setMatrixAt(i, DUMMY.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  }, [panes]);

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const c = new Color();
    panes.forEach(({ spaceId, cap }, i) => {
      const l = liveMap.get(spaceId);
      const ratio = l?.metrics && cap > 0 ? l.metrics.occupancy / cap : 0;
      const k = !l || l.status === "offline" ? 0 : emissiveForNight(ratio);
      im.setColorAt(i, c.copy(WARM_WINDOW).multiplyScalar(k));
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [panes, liveMap]);

  if (panes.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[res.plane, material, panes.length]}
      frustumCulled={false}
      visible={night}
      raycast={noRaycast}
    />
  );
}

/* ----------------------------------------------------------- espacios */

function SpaceVolume({ geom }: { geom: SpaceGeom }) {
  const ctx = useCtx();
  const { space } = geom;
  const live = ctx.liveMap.get(space.id);
  const status = live?.status ?? "offline";
  const targetColor = useMemo(
    () => new Color(colorForSpace(ctx.layer, live, space.capacity)),
    [ctx.layer, live, space.capacity],
  );
  const faded = ctx.isolatedLevel !== null && ctx.isolatedLevel !== geom.level;
  const selected = ctx.selectedId === space.id;
  const hovered = ctx.hoveredId === space.id;
  const ratio = live?.metrics && space.capacity > 0 ? live.metrics.occupancy / space.capacity : 0;
  const nightGlow = ctx.night && status !== "offline" ? emissiveForNight(ratio) : 0;

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: targetColor.clone(),
        emissive: targetColor.clone(),
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 0.4,
        metalness: 0.05,
      }),
    // El color inicial se fija una sola vez; los cambios posteriores se interpolan en useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, dt) => {
    const k = ctx.reduced ? 1 : 1 - Math.exp(-dt * 5);
    material.color.lerp(targetColor, k);
    material.emissive.copy(material.color);

    let glow = 0.12;
    if (status === "critical") {
      glow = ctx.reduced ? 0.45 : 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.8));
    }
    glow += nightGlow * 0.3 + (hovered ? 0.25 : 0) + (selected ? 0.3 : 0);
    material.emissiveIntensity = MathUtils.lerp(material.emissiveIntensity, glow, ctx.reduced ? 1 : k);

    const targetOpacity = faded ? 0.04 : selected ? 0.82 : hovered ? 0.72 : 0.5;
    material.opacity = MathUtils.lerp(material.opacity, targetOpacity, ctx.reduced ? 1 : k);
  });

  const interactive = !faded;
  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      ctx.setHovered(space.id);
    },
    onPointerOut: () => ctx.setHovered(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 4) return; // fue un arrastre de camara, no un clic
      ctx.select(space.id);
    },
  };

  if (geom.mesh) {
    return (
      <primitive
        object={geom.mesh}
        material={material}
        renderOrder={2}
        raycast={interactive ? geom.mesh.raycast : noRaycast}
        {...handlers}
      />
    );
  }
  return (
    <mesh
      name={space.mesh_id}
      geometry={ctx.res.box}
      material={material}
      position={geom.pos}
      scale={geom.size}
      renderOrder={2}
      raycast={interactive ? undefined : noRaycast}
      {...handlers}
    />
  );
}

function SpaceLabel({
  geom,
  selected,
  anchor,
}: {
  geom: SpaceGeom;
  selected: boolean;
  anchor: Vec3;
}) {
  const { layer, liveMap } = useCtx();
  const overlay = useContext(OverlayCtx);
  const live = liveMap.get(geom.space.id);
  const status = live?.status ?? "offline";
  const accent = colorForSpace("status", live, geom.space.capacity);
  const value = primaryValueLabel(layer, live, geom.space.capacity);
  const mono: CSSProperties = {
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontVariantNumeric: "tabular-nums",
  };
  return (
    <Html position={anchor} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} {...(overlay ? { portal: overlay as RefObject<HTMLElement> } : {})}>
      <div
        style={{
          transform: "translateY(-120%)",
          background: PALETTE.panel,
          border: `1px solid ${PALETTE.border}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 8,
          padding: selected ? "7px 11px" : "4px 8px",
          color: PALETTE.text,
          font: '500 12px/1.35 "IBM Plex Sans", system-ui, sans-serif',
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "0 6px 18px rgba(0,0,0,.45)",
        }}
      >
        <div>{geom.space.name}</div>
        <div style={{ ...mono, color: accent, fontSize: 12 }}>{value}</div>
        {selected && value !== STATUS_LABEL[status] ? (
          <div style={{ fontSize: 11, opacity: 0.75 }}>{STATUS_LABEL[status]}</div>
        ) : null}
      </div>
    </Html>
  );
}

/* --------------------------------------------------------------- pisos */

function FloorGroup({ floor }: { floor: FloorInfo }) {
  const ctx = useCtx();
  const { res } = ctx;
  const groupRef = useRef<Group>(null);
  const tRef = useRef(ctx.exploded ? 1 : 0);
  const initialFade = ctx.isolatedLevel === null || ctx.isolatedLevel === floor.level ? 1 : 0.06;
  const fadeRef = useRef(initialFade);
  const isTop = floor.index === ctx.floorCount - 1;

  const mats = useMemo(
    () => ({
      slab: new MeshStandardMaterial({ color: "#3A4C6B", roughness: 0.72, metalness: 0.12, transparent: true }),
      glass: new MeshPhysicalMaterial({
        color: "#12294A",
        metalness: 0.85,
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.6,
        transparent: true,
        opacity: 0.26,
        side: DoubleSide,
        depthWrite: false,
      }),
      frame: new MeshStandardMaterial({ color: "#1C2A45", roughness: 0.35, metalness: 0.7, transparent: true }),
      core: new MeshStandardMaterial({ color: "#26385A", roughness: 0.6, metalness: 0.2, transparent: true }),
      windows: new MeshBasicMaterial({ color: "#FFFFFF", transparent: true }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const tTarget = ctx.exploded ? 1 : 0;
    tRef.current = ctx.reduced ? tTarget : MathUtils.damp(tRef.current, tTarget, 4, dt);
    g.position.y = floor.y0 + (floor.y1 - floor.y0) * tRef.current;

    const fTarget = ctx.isolatedLevel === null || ctx.isolatedLevel === floor.level ? 1 : 0.06;
    fadeRef.current = ctx.reduced ? fTarget : MathUtils.damp(fadeRef.current, fTarget, 6, dt);
    const f = fadeRef.current;
    const solid = f > 0.98;
    mats.slab.opacity = f;
    mats.slab.depthWrite = solid;
    mats.frame.opacity = f;
    mats.frame.depthWrite = solid;
    mats.core.opacity = f;
    mats.core.depthWrite = solid;
    mats.glass.opacity = 0.26 * f;
    mats.windows.opacity = f;
  });

  const labelGeoms = floor.geoms.filter((g) => {
    if (ctx.isolatedLevel !== null && ctx.isolatedLevel !== floor.level) return false;
    return g.space.id === ctx.selectedId || ctx.liveMap.get(g.space.id)?.status === "critical";
  });
  const outlines = floor.geoms.filter((g) => g.space.id === ctx.selectedId || g.space.id === ctx.hoveredId);

  const { footprintW: W, footprintD: D, floorHeight, slab } = DIMS;
  const H = floorHeight - slab;

  return (
    <group ref={groupRef} position={[0, floor.y0, 0]}>
      {ctx.procedural ? (
        <>
          <mesh
            geometry={res.box}
            material={mats.slab}
            position={[0, slab / 2, 0]}
            scale={[W + 0.5, slab, D + 0.5]}
            castShadow={ctx.shadows}
            receiveShadow={ctx.shadows}
            raycast={noRaycast}
          />
          <mesh
            geometry={res.box}
            material={mats.glass}
            position={[0, slab + H / 2, 0]}
            scale={[W, H, D]}
            renderOrder={1}
            raycast={noRaycast}
          />
          <BoxInstances boxes={ctx.frameBoxes} material={mats.frame} />
          <mesh
            geometry={res.box}
            material={mats.core}
            position={[ctx.core.x, ctx.core.y, ctx.core.z]}
            scale={[ctx.core.sx, ctx.core.sy, ctx.core.sz]}
            castShadow={ctx.shadows}
            raycast={noRaycast}
          />
          <WindowInstances geoms={floor.geoms} material={mats.windows} />
          {isTop ? (
            <>
              <mesh
                geometry={res.box}
                material={mats.slab}
                position={[0, floorHeight + slab / 2, 0]}
                scale={[W + 0.5, slab, D + 0.5]}
                castShadow={ctx.shadows}
                receiveShadow={ctx.shadows}
                raycast={noRaycast}
              />
              <BoxInstances boxes={ctx.roofBoxes} material={mats.frame} />
            </>
          ) : null}
        </>
      ) : (
        (ctx.model?.floorNodes.get(floor.level) ?? []).map((n) => <primitive key={n.uuid} object={n} />)
      )}

      {floor.geoms.map((g) => (
        <SpaceVolume key={g.space.id} geom={g} />
      ))}

      {outlines.map((g) => {
        const isSel = g.space.id === ctx.selectedId;
        return (
          <lineSegments
            key={`${g.space.id}-${isSel ? "s" : "h"}`}
            geometry={res.edges}
            material={isSel ? res.lineSelected : res.lineHover}
            position={g.pos}
            scale={[g.size[0] + 0.1, g.size[1] + 0.1, g.size[2] + 0.1]}
            raycast={noRaycast}
          />
        );
      })}

      {labelGeoms.map((g) => (
        <SpaceLabel
          key={g.space.id}
          geom={g}
          selected={g.space.id === ctx.selectedId}
          anchor={[g.pos[0], g.pos[1] + g.size[1] / 2 + 0.2, g.pos[2]]}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ ambiente */

function Lights({ night, shadows }: { night: boolean; shadows: boolean }) {
  const scene = useThree((s) => s.scene);
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const bgTarget = useMemo(() => new Color(), []);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 3);
    if (ambient.current) ambient.current.intensity = MathUtils.lerp(ambient.current.intensity, night ? 0.12 : 0.5, k);
    if (sun.current) sun.current.intensity = MathUtils.lerp(sun.current.intensity, night ? 0.3 : 2.1, k);
    bgTarget.set(night ? PALETTE.bgNight : PALETTE.bg);
    if (scene.background instanceof Color) scene.background.lerp(bgTarget, k);
    scene.fog?.color.lerp(bgTarget, k);
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={night ? 0.12 : 0.5} color="#9db8e8" />
      <directionalLight
        ref={sun}
        position={[34, 54, 28]}
        intensity={night ? 0.3 : 2.1}
        color={night ? "#8fa9ff" : "#fff4e0"}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

/* -------------------------------------------------------------- camara */

function CameraRig({
  floors,
  bounds,
  selectedId,
  focusIds,
  exploded,
  isolatedLevel,
  reduced,
}: {
  floors: FloorInfo[];
  bounds: Box3;
  selectedId: string | null;
  focusIds: string[];
  exploded: boolean;
  isolatedLevel: number | null;
  reduced: boolean;
}) {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  const hadFocus = useRef(false);
  const mounted = useRef(false);
  const focusKey = focusIds.join(",");
  const focusRef = useRef(focusKey);
  focusRef.current = focusKey;

  const home = (animate: boolean, expl: boolean) => {
    const c = ref.current;
    if (!c || viewport.width < 2 || viewport.height < 2) return;
    const box = bounds.clone();
    if (expl) box.max.y += (floors.length - 1) * DIMS.explodeGap;
    // Encuadre calculado desde la caja completa (losas, cubierta y volumenes), con margen.
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 35;
    const v = initialViewFromBox(box, { fovDeg: fov, aspect: viewport.width / viewport.height });
    void c.setLookAt(v.position.x, v.position.y, v.position.z, v.target.x, v.target.y, v.target.z, animate);
  };

  // Vista inicial y limites de panoramica. Solo al montar o cuando cambia la estructura del edificio.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const limit = bounds.clone().expandByScalar(30);
    limit.max.y += floors.length * DIMS.explodeGap;
    limit.min.y = Math.max(limit.min.y, -2);
    c.setBoundary(limit);
    home(false, exploded);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  // Reencuadre al cambiar el tamano del contenedor (sin animacion; no interrumpe un enfoque ni un piso aislado).
  useEffect(() => {
    if (!mounted.current || focusRef.current !== "" || isolatedLevel !== null) return;
    home(false, exploded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  // Vuelo a los espacios enfocados (accion focus_spaces del asistente).
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (focusIds.length === 0) {
      if (hadFocus.current) home(!reduced, exploded);
      hadFocus.current = false;
      return;
    }
    const box = spacesWorldBox(floors, new Set(focusIds), exploded);
    if (box.isEmpty()) return;
    hadFocus.current = true;
    void c.fitToBox(box, !reduced, { paddingTop: 3, paddingBottom: 3, paddingLeft: 3, paddingRight: 3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Ligero enfoque al seleccionar (si no hay un enfoque explicito del asistente).
  useEffect(() => {
    const c = ref.current;
    if (!c || !selectedId || focusRef.current !== "") return;
    const box = spacesWorldBox(floors, new Set([selectedId]), exploded);
    if (box.isEmpty()) return;
    const ctr = box.getCenter(new Vector3());
    void c.moveTo(ctr.x, ctr.y, ctr.z, !reduced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Reencuadre al cambiar explosion o aislamiento de piso.
  useEffect(() => {
    const c = ref.current;
    if (!c || !mounted.current || focusRef.current !== "") return;
    if (isolatedLevel !== null) {
      const ids = new Set(floors.filter((f) => f.level === isolatedLevel).flatMap((f) => f.geoms.map((g) => g.space.id)));
      const box = spacesWorldBox(floors, ids, exploded);
      if (!box.isEmpty()) {
        box.expandByVector(new Vector3(2, 1, 2));
        void c.fitToBox(box, !reduced, { paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 });
        return;
      }
    }
    home(!reduced, exploded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploded, isolatedLevel]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={14}
      maxDistance={170}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.05}
      smoothTime={0.28}
      draggingSmoothTime={0.12}
      dollyToCursor
    />
  );
}

function CursorSync({ pointer }: { pointer: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.domElement.style.cursor = pointer ? "pointer" : "";
    return () => {
      gl.domElement.style.cursor = "";
    };
  }, [gl, pointer]);
  return null;
}

/* --------------------------------------------------------------- escena */

function Scene({
  campus,
  live,
  layer,
  selectedSpaceId,
  onSelectSpace,
  focusSpaceIds,
  exploded = false,
  isolatedLevel = null,
  night = false,
  low,
  reduced,
}: Omit<TwinProps, "quality" | "className"> & { low: boolean; reduced: boolean }) {
  const model = useTwinModel();
  const procedural = model === null;

  // Clave estructural: evita reconstruir (y recentrar la camara) si el campus se vuelve a pedir sin cambios.
  const structureKey = useMemo(
    () =>
      campus.spaces.map((s) => `${s.id}:${s.level}:${s.code}:${s.mesh_id}`).join("|") +
      "#" +
      campus.floors.map((f) => f.level).join(","),
    [campus],
  );
  const { floors, bounds } = useMemo(
    () => buildSceneModel(campus, model, DIMS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey, model],
  );

  const frameBoxes = useMemo(() => buildFrameBoxes(DIMS), []);
  const roofBoxes = useMemo(() => buildRoofBoxes(DIMS), []);
  const core = useMemo(() => coreBox(DIMS), []);
  const liveMap = useMemo(() => liveBySpaceId(live), [live]);
  const [hoveredId, setHovered] = useState<string | null>(null);

  const res = useMemo<Resources>(() => {
    const box = new BoxGeometry(1, 1, 1);
    return {
      box,
      plane: new PlaneGeometry(1, 1),
      ground: new CircleGeometry(150, 64),
      edges: new EdgesGeometry(box),
      lineSelected: new LineBasicMaterial({ color: PALETTE.gold, toneMapped: false }),
      lineHover: new LineBasicMaterial({ color: PALETTE.cyan, toneMapped: false }),
      groundMat: new MeshStandardMaterial({ color: "#0B1527", roughness: 0.92, metalness: 0 }),
      plinthMat: new MeshStandardMaterial({ color: "#1B2842", roughness: 0.8, metalness: 0.15 }),
    };
  }, []);
  useEffect(
    () => () => {
      res.box.dispose();
      res.plane.dispose();
      res.ground.dispose();
      res.edges.dispose();
      res.lineSelected.dispose();
      res.lineHover.dispose();
      res.groundMat.dispose();
      res.plinthMat.dispose();
    },
    [res],
  );

  // Materiales de espacios del GLB: nuestras mallas reemplazan los del modelo, que ya no se usan.
  const shadows = !low;
  const ctx = useMemo<SceneCtx>(
    () => ({
      res,
      procedural,
      model,
      layer,
      liveMap,
      selectedId: selectedSpaceId,
      hoveredId,
      night,
      reduced,
      exploded,
      isolatedLevel,
      shadows,
      floorCount: floors.length,
      frameBoxes,
      roofBoxes,
      core,
      setHovered,
      select: onSelectSpace,
    }),
    [
      res, procedural, model, layer, liveMap, selectedSpaceId, hoveredId, night, reduced,
      exploded, isolatedLevel, shadows, floors.length, frameBoxes, roofBoxes, core, onSelectSpace,
    ],
  );

  const { footprintW: W, footprintD: D, plinthH, plinthMargin } = DIMS;

  return (
    <Ctx.Provider value={ctx}>
      <Lights night={night} shadows={shadows} />
      <Environment frames={1} resolution={low ? 128 : 256} environmentIntensity={night ? 0.25 : 1}>
        <color attach="background" args={["#050914"]} />
        <Lightformer form="rect" intensity={2.4} color="#d6e8ff" position={[0, 12, 0]} scale={[32, 32, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.8} color={PALETTE.cyan} position={[-16, 4, 8]} scale={[22, 7, 1]} target={[0, 2, 0]} />
        <Lightformer form="rect" intensity={1.5} color={PALETTE.blue} position={[16, 3, -8]} scale={[22, 7, 1]} target={[0, 2, 0]} />
        <Lightformer form="ring" intensity={1.3} color={PALETTE.gold} position={[0, 6, -16]} scale={9} target={[0, 2, 0]} />
      </Environment>

      <mesh geometry={res.ground} material={res.groundMat} rotation-x={-Math.PI / 2} position-y={-plinthH - 0.02} receiveShadow={shadows} raycast={noRaycast} />
      <Grid
        position={[0, -plinthH + 0.01, 0]}
        args={[10, 10]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#16294A"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#1F3C6E"
        fadeDistance={low ? 90 : 130}
        fadeStrength={1.4}
        infiniteGrid
        raycast={noRaycast}
      />
      {procedural ? (
        <mesh
          geometry={res.box}
          material={res.plinthMat}
          position={[0, -plinthH / 2, 0]}
          scale={[W + 2 * plinthMargin, plinthH, D + 2 * plinthMargin]}
          castShadow={shadows}
          receiveShadow={shadows}
          raycast={noRaycast}
        />
      ) : model ? (
        <primitive object={model.facade} />
      ) : null}

      {floors.map((f) => (
        <FloorGroup key={f.level} floor={f} />
      ))}

      <CameraRig
        floors={floors}
        bounds={bounds}
        selectedId={selectedSpaceId}
        focusIds={focusSpaceIds ?? []}
        exploded={exploded}
        isolatedLevel={isolatedLevel}
        reduced={reduced}
      />
      <CursorSync pointer={hoveredId !== null} />
    </Ctx.Provider>
  );
}

/* ----------------------------------------------------- contenedor publico */

class TwinErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <div style={{ ...fill, display: "grid", placeItems: "center", color: PALETTE.text, padding: 16, textAlign: "center" }}>
          Vista 3D no disponible en este dispositivo. La lista de espacios sigue disponible.
        </div>
      );
    }
    return this.props.children;
  }
}

const fill: CSSProperties = { position: "absolute", inset: 0 };

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export default function CampusTwin({
  campus,
  live,
  layer,
  selectedSpaceId,
  onSelectSpace,
  focusSpaceIds,
  exploded,
  isolatedLevel,
  night,
  quality = "auto",
  className,
}: TwinProps) {
  const reduced = usePrefersReducedMotion();
  const low = quality === "low";
  const [dpr, setDpr] = useState<[number, number]>(DPR_HIGH);
  const effectiveDpr = low ? DPR_LOW : dpr;

  const provisional = campus.building.geometry_provisional || MODEL_URL === null;
  const label = useMemo(
    () => describeTwin(campus, live, layer, provisional),
    [campus, live, layer, provisional],
  );
  const lines = useMemo(() => describeSpaces(campus, live, layer), [campus, live, layer]);
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 280, background: PALETTE.bg, overflow: "hidden" }}>
      <div role="img" aria-label={label} style={fill}>
        <OverlayCtx.Provider value={overlayRef}>
        <TwinErrorBoundary>
          <Canvas
            shadows={low ? false : "percentage"}
            dpr={effectiveDpr}
            camera={{ fov: 35, near: 0.5, far: 700, position: [60, 45, 70] }}
            gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, powerPreference: "high-performance" }}
            onPointerMissed={() => onSelectSpace(null)}
            style={{ touchAction: "none" }}
          >
            <color attach="background" args={[PALETTE.bg]} />
            <fog attach="fog" args={[PALETTE.bg, 120, 320]} />
            {quality === "auto" ? (
              <PerformanceMonitor
                flipflops={3}
                onDecline={() => setDpr(DPR_LOW)}
                onIncline={() => setDpr(DPR_HIGH)}
                onFallback={() => setDpr([1, 1])}
              />
            ) : null}
            <Suspense fallback={null}>
              <Scene
                campus={campus}
                live={live}
                layer={layer}
                selectedSpaceId={selectedSpaceId}
                onSelectSpace={onSelectSpace}
                focusSpaceIds={focusSpaceIds}
                exploded={exploded}
                isolatedLevel={isolatedLevel}
                night={night}
                low={low}
                reduced={reduced}
              />
            </Suspense>
          </Canvas>
        </TwinErrorBoundary>
        </OverlayCtx.Provider>
        {/* React no gestiona hijos de este div: lo usa drei <Html> como portal. */}
        <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
      </div>

      <p
        style={{
          position: "absolute",
          left: 10,
          bottom: 8,
          margin: 0,
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(23,36,58,.8)",
          border: `1px solid ${PALETTE.border}`,
          color: "#B8C4D8",
          font: '500 11px/1.4 "IBM Plex Sans", system-ui, sans-serif',
          pointerEvents: "none",
        }}
      >
        {provisional ? "Modelo representativo · geometría provisional" : "Modelo 3D del edificio"}
      </p>

      <ul style={srOnly} aria-label="Espacios y estados">
        {lines.map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
      </ul>
    </div>
  );
}
