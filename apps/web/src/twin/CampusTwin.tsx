import type { CampusResponse, LiveSpace, Space } from "@campuspulse/contracts";
import { CameraControls, Environment, Html, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Component,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ACESFilmicToneMapping,
  Matrix4,
  BackSide,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Mesh as ThreeMesh,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
  type InstancedMesh,
  type Intersection,
  type Material,
  type Mesh,
  type Raycaster,
  type Group,
} from "three";
import { describeEmptyLevels, describeSpaces, describeTwin, liveBySpaceId } from "./a11y";
import { STATUS_LABEL, colorForSpace, emissiveForNight, primaryValueLabel, statusCause } from "./colors";
import {
  createPhotoSlot,
  initialCompareState,
  isImageFile,
  letterboxRect,
  reduceCompare,
  referenceSilhouette,
  type PhotoSlot,
} from "./compare";
import {
  APPROX_NOTICE,
  CONTEXT_URL,
  DEFAULT_DIMS,
  INTERIOR_NOTICE,
  MODEL_URL,
  MODEL_URL_MOBILE,
  NO_SPACES_LABEL,
  PALETTE,
  type BuildingDims,
} from "./constants";
import { buildHillRing } from "./environment";
import { BATCH_KEYS, BATCH_META, buildBuilding, type BatchKey, type Building } from "./facade";
import { computeLayout, crownTopY, floorLevels, sectionCutZ, sectionFrameBox } from "./layout";
import { ReferenceOverlay, ReferencePanel } from "./ReferencePanel";
import {
  DAY_COLORS,
  ENV_COLORS,
  INTERIOR_FILL,
  MATERIAL_SPECS,
  NIGHT_COLORS,
  SKY,
  SUN_POSITION,
  WINDOW_LIT,
} from "./materials";
import { profileSettings, resolveProfile } from "./profile";
import type { TwinLayer, TwinProps } from "./types";
import { floorLevelAtY, glbUrlsForProfile, type FloorBand } from "./glb";
import { applyFloorState, applyWindowGlow, floorModeActive, glbDebugSnapshot } from "./glbRuntime";
import { useContextModel, useTwinModel, type TwinModel } from "./useTwinModel";
import { instanceTransform } from "./instancing";
import {
  CAMERA_LIMITS,
  TWIN_PRESETS,
  floorFocusView,
  presetView,
  type TwinPresetId,
} from "./view";

/*
 * Gemelo 3D de CampusPulse 360 (sede UTP Huancayo, 10 pisos).
 * Modelo APROXIMADO basado en fotografia: dimensiones ESTIMADAS (constants.ts,
 * docs/referencias/especificacion-3d.md), sin planos verificados. Todo el edificio se
 * dibuja con una InstancedMesh por material; solo los volumenes SPC_* son mallas propias.
 * Si hay GLB (MODEL_URL), el edificio es el modelo real de Blender (glbBuild.ts) y la geometria
 * procedural queda como respaldo automatico si la carga falla.
 */

const DIMS: BuildingDims = DEFAULT_DIMS;
const DUMMY = new Object3D();
const noRaycast: Mesh["raycast"] = () => {};
const NIGHT_MOON = new Color("#8FA9FF");
const DAY_SUN = new Color("#FFF4E0");

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
}

interface FloorInfo {
  level: number;
  index: number;
  /** Cota de la base del piso en reposo (solo GLB; en la ruta procedural y0 ya es la base y baseY es 0). */
  baseY: number;
  /** Origen Y compacto y explotado (GLB: desplazamiento respecto al reposo). */
  y0: number;
  y1: number;
  height: number;
  geoms: SpaceGeom[];
}

interface Anim {
  /** 0 = dia, 1 = noche (transicion suave). */
  night: number;
  /** 0 = realista, 1 = modo datos. */
  data: number;
  /** 0 = edificio completo, 1 = corte de seccion de la vista Atrio. */
  section: number;
}

interface Mats {
  batch: Record<BatchKey, Material>;
  windows: MeshBasicMaterial;
  ground: MeshStandardMaterial;
  hills: MeshStandardMaterial;
  sky: ShaderMaterial;
}

interface Resources {
  box: BoxGeometry;
  plane: PlaneGeometry;
  ground: CircleGeometry;
  hills: BufferGeometry;
  sky: SphereGeometry;
  edges: EdgesGeometry;
  lineSelected: LineBasicMaterial;
  lineHover: LineBasicMaterial;
}

interface SceneCtx {
  res: Resources;
  mats: Mats;
  anim: MutableRefObject<Anim>;
  procedural: boolean;
  model: TwinModel | null;
  /** Igual que model (modelo GLB) o null en la ruta procedural. */
  glb: TwinModel | null;
  building: Building;
  floors: FloorInfo[];
  spaceCap: Map<string, number>;
  layer: TwinLayer;
  liveMap: Map<string, LiveSpace>;
  selectedId: string | null;
  hoveredId: string | null;
  night: boolean;
  dataMode: boolean;
  reduced: boolean;
  exploded: boolean;
  isolatedLevel: number | null;
  shadows: boolean;
  /** Vista Atrio activa (corte de seccion). */
  section: boolean;
  /** Plano de corte compartido (conserva z <= constant). */
  clip: Plane;
  sectionZ: number;
  setHovered: (id: string | null) => void;
  setPickHover: (v: boolean) => void;
  select: (id: string | null) => void;
  /** Aislar un piso por indice de pila; null si el host no lo soporta. */
  pickLevel: ((index: number) => void) | null;
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
        geoms.push({ space, level: f.level, pos: [box.x, box.y, box.z], size: [box.w, box.h, box.d] });
      }
      return { level: f.level, index: f.index, baseY: 0, y0: f.y, y1: exploded.floors[i]?.y ?? f.y, height: f.height, geoms };
    });
    const b = compact.bounds;
    return {
      floors,
      bounds: new Box3(new Vector3(b.minX, 0, b.minZ), new Vector3(b.maxX, b.maxY, b.maxZ)),
    };
  }
  // Modelo GLB: los volumenes ya estan en coordenadas de edificio; el piso solo aporta el desplazamiento.
  const bands = floorBandsFor(campus, dims);
  const floors: FloorInfo[] = floorLevels(campus).map((level, index) => {
    const geoms: SpaceGeom[] = [];
    const band = bands.find((b) => b.level === level);
    for (const space of campus.spaces) {
      const mesh = model.spaces.get(space.mesh_id);
      if (space.level !== level || !mesh) continue;
      // Caja desde la geometria y la matriz local (el piso esta en reposo): no depende de la animacion.
      mesh.geometry.computeBoundingBox();
      mesh.updateMatrix();
      const box = (mesh.geometry.boundingBox ?? new Box3()).clone().applyMatrix4(mesh.matrix);
      const c = box.getCenter(new Vector3());
      const s = box.getSize(new Vector3());
      geoms.push({ space, level, pos: [c.x, c.y, c.z], size: [s.x, s.y, s.z], mesh });
    }
    return {
      level,
      index,
      baseY: band?.baseY ?? 0,
      y0: 0,
      y1: index * dims.explodeGap,
      height: band?.height ?? dims.floorHeight,
      geoms,
    };
  });
  return { floors, bounds: model.bounds.clone() };
}

/** Franjas Y de cada piso (diseno estimado de layout.ts), usadas para recortar los grupos compartidos del GLB. */
function floorBandsFor(campus: CampusResponse, dims: BuildingDims): FloorBand[] {
  return computeLayout(campus, dims, 0).floors.map((f) => ({ level: f.level, index: f.index, baseY: f.baseY, height: f.height }));
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

/* ------------------------------------------------------------- materiales */

const SKY_VERT = /* glsl */ `
varying float vH;
void main() {
  vH = normalize(position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
varying float vH;
void main() {
  float h = smoothstep(0.0, 0.55, vH);
  gl_FragColor = vec4(mix(horizonColor, topColor, h), 1.0);
  #include <colorspace_fragment>
}`;

/** Materiales que recorta el plano de seccion (el entorno lejano no). */
const UNCLIPPED: ReadonlySet<BatchKey> = new Set<BatchKey>(["sidewalk", "asphalt", "context"]);
/** Materiales de cuerpos cerrados: se dibujan por ambas caras para que el corte se vea macizo. */
const DOUBLE_SIDED: ReadonlySet<BatchKey> = new Set<BatchKey>(["white", "slab", "roof"]);
const BASIC_KEYS: ReadonlySet<BatchKey> = new Set<BatchKey>(["led", "lampHead", "fixture", "screen"]);

function createMats(clip: Plane): Mats {
  const batch = {} as Record<BatchKey, Material>;
  for (const k of BATCH_KEYS) {
    const s = MATERIAL_SPECS[k];
    let mat: Material;
    if (BASIC_KEYS.has(k)) {
      mat = new MeshBasicMaterial({ color: s.color, toneMapped: false });
    } else if (k === "glass") {
      mat = new MeshPhysicalMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: s.metalness,
        clearcoat: s.clearcoat ?? 0.6,
        clearcoatRoughness: 0.03,
        envMapIntensity: s.envMapIntensity ?? 1.8,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
      });
    } else {
      const translucent = s.opacity < 0.999;
      mat = new MeshStandardMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: s.metalness,
        envMapIntensity: s.envMapIntensity ?? 1,
        ...(translucent ? { transparent: true, opacity: s.opacity, depthWrite: false } : {}),
      });
    }
    if (!UNCLIPPED.has(k)) {
      mat.clippingPlanes = [clip];
      mat.clipShadows = true;
    }
    if (DOUBLE_SIDED.has(k)) mat.side = DoubleSide;
    batch[k] = mat;
  }
  const windows = new MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  windows.clippingPlanes = [clip];
  return {
    batch,
    windows,
    ground: new MeshStandardMaterial({ color: DAY_COLORS.ground, roughness: 0.95, metalness: 0 }),
    hills: new MeshStandardMaterial({ color: DAY_COLORS.hills, roughness: 1, metalness: 0, side: DoubleSide }),
    sky: new ShaderMaterial({
      uniforms: { topColor: { value: new Color(SKY.dayTop) }, horizonColor: { value: new Color(SKY.dayHorizon) } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  };
}

function disposeMats(m: Mats): void {
  for (const mat of Object.values(m.batch)) mat.dispose();
  m.windows.dispose();
  m.ground.dispose();
  m.hills.dispose();
  m.sky.dispose();
}

const C = {
  ctxDay: new Color(DAY_COLORS.context),
  ctxNight: new Color(NIGHT_COLORS.context),
  walkDay: new Color(DAY_COLORS.sidewalk),
  walkNight: new Color(MATERIAL_SPECS.sidewalk.color),
  asphDay: new Color(DAY_COLORS.asphalt),
  asphNight: new Color(MATERIAL_SPECS.asphalt.color),
  groundDay: new Color(DAY_COLORS.ground),
  groundNight: new Color(NIGHT_COLORS.ground),
  hillDay: new Color(DAY_COLORS.hills),
  hillNight: new Color(NIGHT_COLORS.hills),
  skyTopDay: new Color(SKY.dayTop),
  skyTopNight: new Color(SKY.nightTop),
  skyHorDay: new Color(SKY.dayHorizon),
  skyHorNight: new Color(SKY.nightHorizon),
  ledDay: new Color("#BFC5CD"),
  ledNight: new Color("#FFFFFF"),
  lampDay: new Color("#8A8472"),
  lampNight: new Color(MATERIAL_SPECS.lampHead.color),
};

const OPACITY_KEYS = ["glass", "white", "frame", "glassGround", "glassClear"] as const;

/** Actualiza los materiales segun la transicion dia/noche y realista/datos. */
function updateMats(m: Mats, a: Anim): void {
  for (const k of OPACITY_KEYS) {
    const mat = m.batch[k] as MeshStandardMaterial;
    const s = MATERIAL_SPECS[k];
    // En el corte de seccion los muros y la carpinteria se vuelven macizos (no translucidos).
    const op = MathUtils.lerp(s.opacity, s.opacityData, a.data * (1 - a.section));
    const transparent = op < 0.999;
    mat.opacity = op;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.depthWrite = !transparent;
      mat.needsUpdate = true;
    }
  }
  (m.batch.context as MeshStandardMaterial).color.lerpColors(C.ctxDay, C.ctxNight, a.night);
  (m.batch.sidewalk as MeshStandardMaterial).color.lerpColors(C.walkDay, C.walkNight, a.night);
  (m.batch.asphalt as MeshStandardMaterial).color.lerpColors(C.asphDay, C.asphNight, a.night);
  (m.batch.led as MeshBasicMaterial).color.lerpColors(C.ledDay, C.ledNight, a.night);
  (m.batch.lampHead as MeshBasicMaterial).color.lerpColors(C.lampDay, C.lampNight, a.night);
  m.ground.color.lerpColors(C.groundDay, C.groundNight, a.night);
  m.hills.color.lerpColors(C.hillDay, C.hillNight, a.night);
  m.windows.opacity = a.night;
  const u = m.sky.uniforms;
  (u["topColor"]!.value as Color).lerpColors(C.skyTopDay, C.skyTopNight, a.night);
  (u["horizonColor"]!.value as Color).lerpColors(C.skyHorDay, C.skyHorNight, a.night);
}

/* ------------------------------------------------------------ instancias */

/**
 * Todo el edificio y el entorno: una InstancedMesh por material. Aqui se aplica la
 * explosion y el aislamiento de piso (un piso aislado deja plegados los demas).
 */
function Batches() {
  const ctx = useCtx();
  const { res, mats, building, floors, anim, reduced, exploded, isolatedLevel, liveMap, spaceCap, shadows } = ctx;
  const refs = useRef<Partial<Record<BatchKey, InstancedMesh | null>>>({});
  const winRef = useRef<InstancedMesh | null>(null);
  const vis = useRef<number[]>([]);
  const expl = useRef(exploded ? 1 : 0);
  const dirty = useRef(true);
  const targetVis = (index: number) =>
    isolatedLevel === null || floors[index]?.level === isolatedLevel ? 1 : 0;

  useEffect(() => {
    if (!VISUAL_TEST) return undefined;
    DEBUG_REG.batches = { refs: refs.current, building, win: winRef.current };
    return () => {
      DEBUG_REG.batches = null;
    };
  }, [building]);

  const staticOnly = useMemo(() => {
    const set = new Set<BatchKey>();
    for (const k of BATCH_KEYS) if (building.boxes[k].every((b) => b.level < 0)) set.add(k);
    return set;
  }, [building]);

  const apply = (force: boolean) => {
    const gap = DIMS.explodeGap;
    const place = (
      im: InstancedMesh,
      i: number,
      level: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      ry: number,
      rx = 0,
    ) => {
      // Ver instancing.ts: un piso oculto debe tener matriz NULA (antes quedaba un plano
      // de tamano completo con normal NaN -> "losas negras").
      const t = instanceTransform(
        { level, x, y, z, sx, sy, sz },
        level >= 0 ? (vis.current[level] ?? 1) : 1,
        expl.current,
        level >= 0 ? (building.levelBase[level] ?? 0) : 0,
        gap,
      );
      DUMMY.position.set(t.x, t.y, t.z);
      DUMMY.rotation.set(rx, ry, 0);
      DUMMY.scale.set(t.sx, t.sy, t.sz);
      DUMMY.updateMatrix();
      im.setMatrixAt(i, DUMMY.matrix);
    };
    for (const key of BATCH_KEYS) {
      const im = refs.current[key];
      const list = building.boxes[key];
      if (!im || list.length === 0) continue;
      if (!force && staticOnly.has(key)) continue;
      list.forEach((b, i) => place(im, i, b.level, b.x, b.y, b.z, b.sx, b.sy, b.sz, b.ry ?? 0, b.rx ?? 0));
      im.instanceMatrix.needsUpdate = true;
      // Las cajas de un piso oculto ya no ocupan espacio: recalcular la esfera envolvente
      // evita un frustum culling o raycast basados en la geometria anterior.
      im.computeBoundingSphere();
    }
    const wm = winRef.current;
    if (wm) {
      building.windows.forEach((p, i) => place(wm, i, p.level, p.x, p.y, p.z, p.w, p.h, 1, p.ry));
      wm.instanceMatrix.needsUpdate = true;
    }
  };

  useLayoutEffect(() => {
    vis.current = floors.map((_, i) => targetVis(i));
    expl.current = exploded ? 1 : 0;
    apply(true);
    dirty.current = false;
    // Solo cuando cambia la estructura; los cambios de estado se animan en useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, floors]);

  // Color por instancia (vidrio por piso, lomos de libros, contexto urbano).
  useLayoutEffect(() => {
    const c = new Color();
    for (const key of BATCH_KEYS) {
      if (!BATCH_META[key].tinted) continue;
      const im = refs.current[key];
      if (!im) continue;
      building.boxes[key].forEach((b, i) => {
        im.setColorAt(i, c.set(b.color ?? "#FFFFFF"));
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }, [building, floors]);

  // Color de cada ventana: ocupacion en los pisos con datos, patron estable en el resto.
  useLayoutEffect(() => {
    const im = winRef.current;
    if (!im) return;
    const c = new Color();
    building.windows.forEach((p, i) => {
      let k: number;
      if (p.spaceId) {
        const l = liveMap.get(p.spaceId);
        const cap = spaceCap.get(p.spaceId) ?? 0;
        const ratio = l?.metrics && cap > 0 ? l.metrics.occupancy / cap : 0;
        k = !l || l.status === "offline" ? 0 : emissiveForNight(ratio) * (0.6 + 0.4 * p.seed);
      } else {
        k = p.seed < 0.6 ? 0.3 + 0.7 * (p.seed / 0.6) : 0.04;
      }
      im.setColorAt(i, c.set(WINDOW_LIT).multiplyScalar(k));
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [building, liveMap, spaceCap]);

  useFrame((_, dt) => {
    let changed = dirty.current;
    const tExpl = exploded ? 1 : 0;
    const e = reduced ? tExpl : MathUtils.damp(expl.current, tExpl, 4, dt);
    const eSnap = Math.abs(e - tExpl) < 0.002 ? tExpl : e;
    if (eSnap !== expl.current) {
      expl.current = eSnap;
      changed = true;
    }
    floors.forEach((_f, i) => {
      const t = targetVis(i);
      const cur = vis.current[i] ?? t;
      const v = reduced ? t : MathUtils.damp(cur, t, 6, dt);
      const vSnap = Math.abs(v - t) < 0.003 ? t : v;
      if (vSnap !== cur) {
        vis.current[i] = vSnap;
        changed = true;
      }
    });
    if (changed) {
      apply(false);
      dirty.current = false;
    }
    const showInterior = anim.current.data > 0.02 || anim.current.section > 0.02;
    for (const key of BATCH_KEYS) {
      const im = refs.current[key];
      if (im) im.visible = !BATCH_META[key].interior || showInterior;
    }
    if (winRef.current) winRef.current.visible = anim.current.night > 0.02;
  });

  const pickHandlers = (key: BatchKey) => {
    if (!BATCH_META[key].pick || !ctx.pickLevel) return { raycast: noRaycast };
    const list = building.boxes[key];
    const overSpace = (e: ThreeEvent<MouseEvent | PointerEvent>) =>
      e.intersections.some((h) => h.object.userData["spaceId"] !== undefined);
    return {
      onClick: (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 4 || overSpace(e)) return;
        const b = e.instanceId === undefined ? undefined : list[e.instanceId];
        if (!b || b.level < 0) return;
        e.stopPropagation();
        ctx.pickLevel?.(b.level);
      },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        if (overSpace(e)) return;
        e.stopPropagation();
        ctx.setPickHover(true);
      },
      onPointerOut: () => ctx.setPickHover(false),
    };
  };

  return (
    <>
      {BATCH_KEYS.map((key) => {
        const list = building.boxes[key];
        if (list.length === 0) return null;
        const meta = BATCH_META[key];
        const receive = key === "white" || key === "slab" || key === "roof" || key === "sidewalk" || key === "asphalt" || key === "tile";
        return (
          <instancedMesh
            key={`${key}-${list.length}`}
            ref={(m: InstancedMesh | null) => {
              refs.current[key] = m;
            }}
            args={[res.box, mats.batch[key], list.length]}
            frustumCulled={false}
            castShadow={shadows && meta.shadow}
            receiveShadow={shadows && receive}
            {...pickHandlers(key)}
          />
        );
      })}
      {building.windows.length > 0 ? (
        <instancedMesh
          key={`win-${building.windows.length}`}
          ref={winRef}
          args={[res.plane, mats.windows, building.windows.length]}
          frustumCulled={false}
          visible={false}
          raycast={noRaycast}
        />
      ) : null}
    </>
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
  const tintRef = useRef<Mesh>(null);

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: targetColor.clone(),
        emissive: targetColor.clone(),
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        roughness: 0.4,
        metalness: 0.05,
        clippingPlanes: [ctx.clip],
      }),
    // El color inicial se fija una sola vez; los cambios posteriores se interpolan en useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Suelo tenue del ambiente en la vista Atrio: conserva la lectura por estado sin tapar el interior.
  const tint = useMemo(
    () =>
      new MeshBasicMaterial({
        color: targetColor.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        clippingPlanes: [ctx.clip],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    return () => {
      material.dispose();
      tint.dispose();
    };
  }, [material, tint]);

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

    // Realista: tinte tenue tras el vidrio. Datos: volumen completo. Atrio (corte): casi invisible, solo al
    // seleccionar o pasar el cursor; el estado se lee en el suelo del ambiente.
    const sec = ctx.anim.current.section;
    const baseOpacity = MathUtils.lerp(0.16, 0.5, ctx.anim.current.data) * (1 - sec);
    const selOpacity = MathUtils.lerp(0.82, 0.34, sec);
    const hovOpacity = MathUtils.lerp(0.72, 0.2, sec);
    // Un espacio en alerta se ve tambien en la vista realista (volumen mas opaco), no solo en el panel.
    const alertOpacity = status === "critical" ? 0.62 : status === "warning" ? 0.45 : 0;
    const targetOpacity = faded ? 0.04 : selected ? Math.max(selOpacity, alertOpacity) : hovered ? hovOpacity : Math.max(baseOpacity, alertOpacity * (1 - sec * 0.5));
    material.opacity = MathUtils.lerp(material.opacity, targetOpacity, ctx.reduced ? 1 : k);
    material.visible = material.opacity > 0.015;

    tint.color.copy(material.color);
    tint.opacity = MathUtils.lerp(tint.opacity, faded ? 0.03 : 0.34 * sec, ctx.reduced ? 1 : k);
    if (tintRef.current) tintRef.current.visible = tint.opacity > 0.01;
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
      if (e.delta > 8) return; // fue un arrastre de camara (tolerancia mayor en tactil), no un clic
      ctx.select(space.id);
    },
  };

  // En el corte, la parte recortada del volumen no se puede seleccionar.
  const clippedRaycast = useMemo(
    () =>
      function (this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
        const found: Intersection[] = [];
        ThreeMesh.prototype.raycast.call(this, raycaster, found);
        const cut = ctx.anim.current.section > 0.5;
        for (const h of found) if (!cut || h.point.z <= ctx.sectionZ + 0.01) intersects.push(h);
      },
    [ctx.anim, ctx.sectionZ],
  );

  useEffect(() => {
    if (!VISUAL_TEST || faded) return undefined;
    DEBUG_REG.spaces.add(space.id);
    return () => {
      DEBUG_REG.spaces.delete(space.id);
    };
  }, [faded, space.id]);
  // Piso no aislado: el volumen no se dibuja (ni bloquea la vista ni recibe el raycast).
  if (faded) return null;
  if (geom.mesh) {
    return (
      <primitive
        object={geom.mesh}
        material={material}
        renderOrder={2}
        userData={{ spaceId: space.id }}
        raycast={interactive ? clippedRaycast : noRaycast}
        {...handlers}
      />
    );
  }
  return (
    <>
      <mesh
        name={space.mesh_id}
        geometry={ctx.res.box}
        material={material}
        position={geom.pos}
        scale={geom.size}
        renderOrder={2}
        userData={{ spaceId: space.id }}
        raycast={interactive ? clippedRaycast : noRaycast}
        {...handlers}
      />
      <mesh
        ref={tintRef}
        geometry={ctx.res.plane}
        material={tint}
        position={[geom.pos[0], geom.pos[1] - geom.size[1] / 2 + 0.045, geom.pos[2]]}
        rotation-x={-Math.PI / 2}
        scale={[Math.max(0.1, geom.size[0] - 0.3), Math.max(0.1, geom.size[2] - 0.3), 1]}
        renderOrder={1}
        visible={false}
        raycast={noRaycast}
      />
    </>
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

/**
 * Baliza de estado para espacios en advertencia o critico. Es una etiqueta DOM sin oclusion:
 * se ve tambien desde la vista Fachada (el vidrio es casi opaco) y desde cualquier angulo.
 */
function SpaceBeacon({ geom, anchor }: { geom: SpaceGeom; anchor: Vec3 }) {
  const ctx = useCtx();
  const overlay = useContext(OverlayCtx);
  const live = ctx.liveMap.get(geom.space.id);
  const status = live?.status;
  const critical = status === "critical";
  const offline = status === "offline";
  // Color y texto salen del estado calculado por la API (reglas de STATUS_THRESHOLDS), nunca de la animacion.
  const color = offline ? PALETTE.offline : critical ? PALETTE.critical : PALETTE.gold;
  const text = offline ? "sin conexión" : critical ? "crítico" : "advertencia";
  const cause = statusCause(live, geom.space.capacity);
  return (
    <Html position={anchor} center zIndexRange={[24, 0]} style={{ pointerEvents: "none" }} {...(overlay ? { portal: overlay as RefObject<HTMLElement> } : {})}>
      <style>{"@keyframes cpBeacon{0%{transform:scale(.8);opacity:.85}100%{transform:scale(2.1);opacity:0}}"}</style>
      <button
        type="button"
        aria-label={`Seleccionar ${geom.space.name}, ${text}: ${cause.label}`}
        title={`${geom.space.name}: ${text} (${cause.label})`}
        onClick={() => ctx.select(geom.space.id)}
        style={{
          pointerEvents: "auto",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          padding: 6,
          margin: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          font: '700 10px/1 "IBM Plex Sans", system-ui, sans-serif',
        }}
      >
        <span style={{ position: "relative", width: 24, height: 24, display: "grid", placeItems: "center" }}>
          {ctx.reduced || offline ? null : (
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: `2px solid ${color}`,
                animation: `cpBeacon ${critical ? "1.1s" : "1.8s"} ease-out infinite`,
              }}
            />
          )}
          <span
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: color,
              border: `2px solid ${PALETTE.bg}`,
              color: PALETTE.bg,
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              boxShadow: `0 0 0 1px ${color}, 0 2px 8px rgba(0,0,0,.55)`,
            }}
          >
            {offline ? "⊘" : "!"}
          </span>
        </span>
        <span style={{ background: PALETTE.panel, color: PALETTE.text, borderRadius: 4, padding: "2px 5px", border: `1px solid ${color}`, whiteSpace: "nowrap" }}>
          {geom.space.code} · {cause.label}
        </span>
      </button>
    </Html>
  );
}

/* --------------------------------------------------------------- pisos */

/** Volumenes de espacio, contornos y etiquetas de un piso (la estructura va en Batches o en el GLB). */
function FloorGroup({ floor }: { floor: FloorInfo }) {
  const ctx = useCtx();
  const { res } = ctx;
  // GLB: el grupo FLOOR_Pxx del modelo es la raiz de este piso (GlbBuilding lo aisla y explota).
  const glbFloor = ctx.glb?.floors.get(floor.level) ?? null;
  const groupRef = useRef<Group>(null);
  const tRef = useRef(ctx.exploded ? 1 : 0);

  useFrame((_, dt) => {
    if (glbFloor) return;
    const g = groupRef.current;
    if (!g) return;
    const tTarget = ctx.exploded ? 1 : 0;
    tRef.current = ctx.reduced ? tTarget : MathUtils.damp(tRef.current, tTarget, 4, dt);
    g.position.y = floor.y0 + (floor.y1 - floor.y0) * tRef.current;
  });

  const shown = (g: SpaceGeom) => {
    if (ctx.isolatedLevel !== null && ctx.isolatedLevel !== floor.level) return false;
    // En el corte de la vista Atrio, los espacios recortados no tienen donde apoyar la etiqueta.
    return !(ctx.section && ctx.procedural && g.pos[2] > ctx.sectionZ);
  };
  const labelGeoms = floor.geoms.filter((g) => {
    if (!shown(g)) return false;
    return g.space.id === ctx.selectedId || ctx.liveMap.get(g.space.id)?.status === "critical";
  });
  const beaconGeoms = floor.geoms.filter((g) => {
    const st = ctx.liveMap.get(g.space.id)?.status;
    return shown(g) && (st === "warning" || st === "critical" || st === "offline");
  });
  const outlines = floor.geoms.filter((g) => g.space.id === ctx.selectedId || g.space.id === ctx.hoveredId);
  // Balizas y etiquetas: en el GLB van en ANCHOR_SPC_* (se mueven con el piso al explotar).
  const anchorOf = (g: SpaceGeom): Vec3 => {
    const a = ctx.glb?.anchors.get(g.space.mesh_id);
    return a ? [a.x, a.y, a.z] : [g.pos[0], g.pos[1] + g.size[1] / 2 + 0.2, g.pos[2]];
  };

  const inner = (
    <>
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

      {beaconGeoms.map((g) => (
        <SpaceBeacon key={g.space.id} geom={g} anchor={anchorOf(g)} />
      ))}

      {labelGeoms.map((g) => (
        <SpaceLabel key={g.space.id} geom={g} selected={g.space.id === ctx.selectedId} anchor={anchorOf(g)} />
      ))}
    </>
  );

  if (glbFloor) {
    const spaceHit = (e: ThreeEvent<MouseEvent | PointerEvent>) =>
      e.intersections.some((h) => h.object.userData["spaceId"] !== undefined || h.object.userData["spaceMeshId"] !== undefined);
    const picks = ctx.pickLevel
      ? {
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (e.delta > 4 || spaceHit(e) || e.object.userData["part"] === undefined) return;
            if (ctx.anim.current.section > 0.5 && e.point.z > ctx.sectionZ + 0.01) return;
            e.stopPropagation();
            ctx.pickLevel?.(floor.index);
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            if (spaceHit(e) || e.object.userData["part"] === undefined) return;
            ctx.setPickHover(true);
          },
          onPointerOut: () => ctx.setPickHover(false),
        }
      : {};
    return (
      <primitive object={glbFloor.group} {...picks}>
        {inner}
      </primitive>
    );
  }
  return (
    <group ref={groupRef} position={[0, floor.y0, 0]}>
      {inner}
    </group>
  );
}

/**
 * Edificio del GLB: aislamiento (group.visible) y explosion (position.y) por piso, dibujo
 * "completo" fusionado en la vista normal y por pisos al aislar o explotar. Nunca escala.
 */
function GlbBuilding() {
  const ctx = useCtx();
  const glb = ctx.glb;
  const expl = useRef(ctx.exploded ? 1 : 0);
  const stateRef = useRef({ iso: ctx.isolatedLevel, exploded: ctx.exploded });
  stateRef.current = { iso: ctx.isolatedLevel, exploded: ctx.exploded };

  const apply = (t: number) => {
    if (!glb) return;
    const { iso, exploded } = stateRef.current;
    applyFloorState(glb, {
      isolatedLevel: iso,
      explode: t,
      gap: DIMS.explodeGap,
      floorMode: floorModeActive(iso, exploded, t),
    });
  };

  useLayoutEffect(() => {
    apply(expl.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glb, ctx.isolatedLevel, ctx.exploded]);

  // Brillo nocturno de la ventana de cada espacio segun su ocupacion.
  useLayoutEffect(() => {
    if (!glb) return;
    const k = new Map<string, number>();
    for (const f of ctx.floors) {
      for (const g of f.geoms) {
        const l = ctx.liveMap.get(g.space.id);
        const cap = ctx.spaceCap.get(g.space.id) ?? 0;
        const ratio = l?.metrics && cap > 0 ? l.metrics.occupancy / cap : 0;
        k.set(g.space.mesh_id, !l || l.status === "offline" ? 0 : emissiveForNight(ratio));
      }
    }
    applyWindowGlow(glb, k);
    // Alertas visibles desde la fachada: solo los espacios en advertencia o critico (estado de la API).
    const alerts = new Map<string, "warning" | "critical">();
    for (const f of ctx.floors) {
      for (const g of f.geoms) {
        const st = ctx.liveMap.get(g.space.id)?.status;
        if (st === "warning" || st === "critical") alerts.set(g.space.mesh_id, st);
      }
    }
    glb.mats.setAlerts(alerts, ctx.reduced);
  }, [glb, ctx.floors, ctx.liveMap, ctx.spaceCap, ctx.reduced]);

  useFrame((_, dt) => {
    const target = stateRef.current.exploded ? 1 : 0;
    const e = ctx.reduced ? target : MathUtils.damp(expl.current, target, 4, dt);
    expl.current = Math.abs(e - target) < 0.002 ? target : e;
    apply(expl.current);
  });

  if (!glb) return null;
  const picks = ctx.pickLevel
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 4 || e.intersections.some((h) => h.object.userData["spaceId"] !== undefined)) return;
          if (ctx.anim.current.section > 0.5 && e.point.z > ctx.sectionZ + 0.01) return;
          const level = floorLevelAtY(e.point.y, glb.bands);
          const index = ctx.floors.findIndex((f) => f.level === level);
          if (index < 0) return;
          e.stopPropagation();
          ctx.pickLevel?.(index);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          if (e.intersections.some((h) => h.object.userData["spaceId"] !== undefined)) return;
          ctx.setPickHover(true);
        },
        onPointerOut: () => ctx.setPickHover(false),
      }
    : {};
  return <primitive object={glb.whole} {...picks} />;
}

/** Contexto urbano opcional del GLB (utp-context.glb); si falla, su ErrorBoundary no dibuja nada. */
function GlbContext({ url, profile, shadows }: { url: string; profile: "high" | "low"; shadows: boolean }) {
  const ctx = useCtx();
  const model = useContextModel(url, profile, shadows);
  const isolated = ctx.isolatedLevel !== null;
  useEffect(() => {
    model.setFocus(isolated);
  }, [model, isolated]);
  useFrame(() => {
    model.update(ctx.anim.current.night);
  });
  return <primitive object={model.group} />;
}

/*
 * Indicador de recorrido de ascensor (vista Atrio). El GLB NO tiene cabinas: el nucleo es una malla unica y la
 * disposicion real de los dos grupos de ascensores no esta confirmada. Por eso se muestra un marcador luminoso que
 * viaja entre niveles frente al muro de ascensores, rotulado como ilustrativo (no es una cabina modelada ni datos).
 * Posicion tomada del modelo de Blender (build_utp_huancayo.py: cara del nucleo en x = 10,4 m, puerta central z = 0).
 */
const ELEV_FACE_X = 10.4 - 0.32;
const ELEV_DOOR_Z = 0;
const ELEV_SEQUENCE = [0, 5, 2, 8, 4, 9, 1, 6, 3, 7];

function ElevatorIndicator({ floors }: { floors: FloorInfo[] }) {
  const ctx = useCtx();
  const overlay = useContext(OverlayCtx);
  const marker = useRef<Mesh>(null);
  const [label, setLabel] = useState<{ level: number; dir: "up" | "down" | "stop" }>({ level: floors[0]?.level ?? 1, dir: "stop" });
  const st = useRef({ seq: 0, y: (floors[0]?.baseY ?? 0) + 1.3, wait: 1.2 });
  const yOf = (i: number) => (floors[i]?.baseY ?? 0) + 1.3;
  // Volumen con fondo (0,5 m hacia el pasillo) para que se lea desde la vista oblicua del Atrio.
  const geom = useMemo(() => new BoxGeometry(0.5, 0.6, 1.2), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9, toneMapped: false }), []);
  const rail = useMemo(() => {
    const top = (floors[floors.length - 1]?.baseY ?? 30) + 3.6;
    const g = new BufferGeometry().setFromPoints([new Vector3(ELEV_FACE_X, 0.3, ELEV_DOOR_Z), new Vector3(ELEV_FACE_X, top, ELEV_DOOR_Z)]);
    return g;
  }, [floors]);
  const railMat = useMemo(() => new LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35 }), []);
  useEffect(
    () => () => {
      geom.dispose();
      mat.dispose();
      rail.dispose();
      railMat.dispose();
    },
    [geom, mat, rail, railMat],
  );
  useFrame((state, dt) => {
    const m = marker.current;
    if (!m || floors.length === 0) return;
    const s0 = st.current;
    const targetIdx = ELEV_SEQUENCE[s0.seq % ELEV_SEQUENCE.length]! % floors.length;
    const ty = yOf(targetIdx);
    if (ctx.reduced) {
      s0.y = ty;
    } else if (Math.abs(ty - s0.y) > 0.02) {
      // ~1,6 m/s con arranque y frenado suaves (damp), independiente de los FPS.
      s0.y = MathUtils.damp(s0.y, ty, 1.6, Math.min(dt, 0.05));
    }
    const arrived = Math.abs(ty - s0.y) <= 0.05;
    if (arrived) {
      s0.wait -= dt;
      if (s0.wait <= 0) {
        s0.seq += 1;
        s0.wait = ctx.reduced ? 3 : 1.4;
        const next = yOf(ELEV_SEQUENCE[s0.seq % ELEV_SEQUENCE.length]! % floors.length);
        setLabel({ level: floors[ELEV_SEQUENCE[s0.seq % ELEV_SEQUENCE.length]! % floors.length]!.level, dir: next > s0.y ? "up" : "down" });
      } else if (label.dir !== "stop") {
        setLabel((l) => ({ ...l, dir: "stop" }));
      }
    }
    m.position.set(ELEV_FACE_X, s0.y, ELEV_DOOR_Z);
    mat.opacity = ctx.reduced ? 0.9 : 0.7 + 0.25 * Math.sin(state.clock.elapsedTime * 5);
  });
  const arrow = label.dir === "up" ? "▲" : label.dir === "down" ? "▼" : "●";
  return (
    <group raycast={noRaycast}>
      <lineSegments geometry={rail} material={railMat} raycast={noRaycast} />
      <mesh ref={marker} geometry={geom} material={mat} raycast={noRaycast}>
        <Html center position={[-0.6, 0.75, 0]} zIndexRange={[18, 0]} style={{ pointerEvents: "none" }} {...(overlay ? { portal: overlay as RefObject<HTMLElement> } : {})}>
          <div
            style={{
              background: PALETTE.panel,
              border: `1px solid ${PALETTE.cyan}`,
              color: PALETTE.text,
              borderRadius: 6,
              padding: "2px 6px",
              font: '600 11px/1.3 "IBM Plex Sans", system-ui, sans-serif',
              whiteSpace: "nowrap",
            }}
          >
            {arrow} Ascensor · P{label.level}
            <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.75 }}>indicador ilustrativo, sin cabina modelada</div>
          </div>
        </Html>
      </mesh>
    </group>
  );
}

/** Draw calls reales del ultimo fotograma (renderer.info), para el inspector y un log de desarrollo. */
function DrawCallProbe() {
  const gl = useThree((st) => st.gl);
  const last = useRef({ calls: -1, at: 0 });
  useFrame((state) => {
    const { calls, triangles } = gl.info.render;
    // El fotograma de captura del entorno (Lightformers: 6 caras, 12 triangulos) no es una escena real.
    if (calls > 6 || triangles > 12) {
      DEBUG_REG.drawCalls = calls;
      DEBUG_REG.triangles = triangles;
    }
    if (!LOG_DRAWS || calls <= 0) return;
    const now = state.clock.elapsedTime;
    if (calls !== last.current.calls && now - last.current.at > 1.5) {
      last.current = { calls, at: now };
      console.info(`[twin] draw calls=${calls} triangulos=${triangles} geometrias=${gl.info.memory.geometries}`);
    }
  });
  return null;
}

/* ------------------------------------------------------------ ambiente */

/** Luces, transicion dia/noche, niebla y entorno reflejado. Debe montarse antes que Batches. */
function Atmosphere({ shadows, shadowMapSize }: { shadows: boolean; shadowMapSize: number }) {
  const ctx = useCtx();
  const scene = useThree((s) => s.scene);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);

  useFrame((_, dt) => {
    const a = ctx.anim.current;
    const kN = ctx.reduced ? 1 : 1 - Math.exp(-dt * 2.2);
    const kD = ctx.reduced ? 1 : 1 - Math.exp(-dt * 5);
    const nTarget = ctx.night ? 1 : 0;
    const dTarget = ctx.dataMode ? 1 : 0;
    a.night += (nTarget - a.night) * kN;
    a.data += (dTarget - a.data) * kD;
    if (Math.abs(a.night - nTarget) < 0.002) a.night = nTarget;
    if (Math.abs(a.data - dTarget) < 0.002) a.data = dTarget;
    const sTarget = ctx.section ? 1 : 0;
    a.section += (sTarget - a.section) * (ctx.reduced ? 1 : 1 - Math.exp(-dt * 3.5));
    if (Math.abs(a.section - sTarget) < 0.002) a.section = sTarget;
    // El plano barre desde fuera del edificio hasta la cota del corte.
    ctx.clip.constant = a.section < 0.002 ? 1000 : MathUtils.lerp(70, ctx.sectionZ, a.section);

    updateMats(ctx.mats, a);
    ctx.glb?.mats.update(a);
    if (hemi.current) hemi.current.intensity = MathUtils.lerp(0.72, 0.3, a.night);
    if (sun.current) {
      // Sol algo mas suave dentro del corte para equilibrarlo con la luz calida interior.
      sun.current.intensity = MathUtils.lerp(2.2, 0.34, a.night) * MathUtils.lerp(1, 0.72, a.section);
      sun.current.color.lerpColors(DAY_SUN, NIGHT_MOON, a.night);
      // Sombras menos duras de noche (la luz lunar es difusa).
      sun.current.shadow.intensity = MathUtils.lerp(0.85, 0.5, a.night);
    }
    if (fill.current) fill.current.intensity = a.section * MathUtils.lerp(1.1, 1.45, a.night);
    scene.environmentIntensity = MathUtils.lerp(1, 0.2, a.night);
    if (scene.fog) scene.fog.color.lerpColors(C.skyHorDay, C.skyHorNight, a.night);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[ENV_COLORS.sky, ENV_COLORS.horizon, 0.62]} />
      <directionalLight
        ref={sun}
        position={SUN_POSITION}
        intensity={2.4}
        color="#FFF4E0"
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={5}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      {/* Relleno interior calido-neutro, solo en el corte de la vista Atrio; sin sombras. */}
      <directionalLight ref={fill} position={INTERIOR_FILL.position} intensity={0} color={INTERIOR_FILL.color} />
    </>
  );
}

/* -------------------------------------------------------------- camara */

interface PresetRequest {
  id: TwinPresetId;
  n: number;
}

function CameraRig({
  floors,
  bounds,
  atriumBox,
  presetReq,
  initialPreset,
  selectedId,
  focusIds,
  exploded,
  isolatedLevel,
  reduced,
  coarse,
  onUserInteract,
  cinematic = false,
}: {
  onUserInteract?: (() => void) | undefined;
  cinematic?: boolean;
  coarse: boolean;
  floors: FloorInfo[];
  bounds: Box3;
  atriumBox: Box3;
  presetReq: PresetRequest | null;
  initialPreset: TwinPresetId;
  selectedId: string | null;
  focusIds: string[];
  exploded: boolean;
  isolatedLevel: number | null;
  reduced: boolean;
}) {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  // "controlstart" solo lo emite camera-controls ante entrada del usuario (no en setLookAt programatico).
  const interactRef = useRef(onUserInteract);
  interactRef.current = onUserInteract;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onStart = () => interactRef.current?.();
    c.addEventListener("controlstart", onStart);
    return () => c.removeEventListener("controlstart", onStart);
  }, []);

  // Movimiento cinematografico del recorrido: orbita lenta y continua alrededor del objetivo actual. En el Atrio
  // (corte de seccion) solo se balancea +-0,22 rad para no mostrar el corte de lado. Se suma al destino de la
  // transicion en curso (rotate con transicion), asi no corta las transiciones entre presets. Usa delta time.
  const sway = useRef(0);
  useFrame((state, dt) => {
    const c = ref.current;
    if (!c || !cinematic || reduced) return;
    const step = Math.min(dt, 0.05);
    if (presetRef.current === "atrium") {
      const target = 0.22 * Math.sin(state.clock.elapsedTime * 0.45);
      const d = target - sway.current;
      sway.current = target;
      void c.rotate(d, 0, true);
    } else {
      sway.current = 0;
      void c.rotate(0.11 * step, 0, true);
    }
  });
  const viewport = useThree((s) => s.size);
  const hadFocus = useRef(false);
  const mounted = useRef(false);
  const focusKey = focusIds.join(",");
  const focusRef = useRef(focusKey);
  focusRef.current = focusKey;
  const presetRef = useRef<TwinPresetId>(initialPreset);

  const viewOpts = () => ({
    fovDeg: camera instanceof PerspectiveCamera ? camera.fov : 35,
    aspect: viewport.width / viewport.height,
  });

  const applyPreset = (id: TwinPresetId, animate: boolean, expl: boolean) => {
    const c = ref.current;
    if (!c || viewport.width < 2 || viewport.height < 2) return;
    presetRef.current = id;
    const box = bounds.clone();
    if (expl) box.max.y += (floors.length - 1) * DIMS.explodeGap;
    const v = presetView(id, box, atriumBox, viewOpts());
    void c.setLookAt(v.position.x, v.position.y, v.position.z, v.target.x, v.target.y, v.target.z, animate);
  };

  const floorBox = (level: number, expl: boolean): Box3 | null => {
    const f = floors.find((x) => x.level === level);
    if (!f) return null;
    const y = f.baseY + (expl ? f.y1 : f.y0);
    return new Box3(
      new Vector3(-DIMS.footprintW / 2, y, -DIMS.footprintD / 2),
      new Vector3(DIMS.footprintW / 2, y + f.height, DIMS.footprintD / 2),
    );
  };

  // Vista inicial y limites de panoramica. Solo al montar o cuando cambia la estructura del edificio.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const m = CAMERA_LIMITS.panMargin;
    const limit = new Box3(
      new Vector3(bounds.min.x - m, 0, bounds.min.z - m),
      new Vector3(bounds.max.x + m, bounds.max.y + m + floors.length * DIMS.explodeGap, bounds.max.z + m),
    );
    c.setBoundary(limit);
    applyPreset(presetRef.current, false, exploded);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  // Reencuadre al cambiar el tamano del contenedor (sin animacion; no interrumpe un enfoque ni un piso aislado).
  useEffect(() => {
    if (!mounted.current || focusRef.current !== "" || isolatedLevel !== null) return;
    applyPreset(presetRef.current, false, exploded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  // Preset pedido por los botones o por la prop cameraPreset.
  useEffect(() => {
    if (!presetReq || !mounted.current) return;
    // Con un piso aislado (p. ej. al aislar desde Atrio/Referencia la maquina de estados pasa a
    // Fachada), el encuadre del piso tiene prioridad: el preset no debe sobrescribirlo.
    if (isolatedLevel !== null && (presetReq.id === "facade" || presetReq.id === "aerial")) {
      const box = floorBox(isolatedLevel, exploded);
      const c = ref.current;
      if (box && c) {
        const v = floorFocusView(box, viewOpts());
        void c.setLookAt(v.position.x, v.position.y, v.position.z, v.target.x, v.target.y, v.target.z, !reduced);
        return;
      }
    }
    applyPreset(presetReq.id, !reduced, exploded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetReq?.n]);

  // Vuelo a los espacios enfocados (accion focus_spaces del asistente).
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (focusIds.length === 0) {
      if (hadFocus.current) applyPreset(presetRef.current, !reduced, exploded);
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

  // Reencuadre al cambiar explosion o aislamiento de piso (enfoque de piso, tenga o no espacios).
  useEffect(() => {
    const c = ref.current;
    if (!c || !mounted.current || focusRef.current !== "") return;
    if (isolatedLevel !== null) {
      const box = floorBox(isolatedLevel, exploded);
      if (box) {
        const v = floorFocusView(box, viewOpts());
        void c.setLookAt(v.position.x, v.position.y, v.position.z, v.target.x, v.target.y, v.target.z, !reduced);
        return;
      }
    }
    applyPreset(presetRef.current, !reduced, exploded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploded, isolatedLevel]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={CAMERA_LIMITS.minDistance}
      maxDistance={CAMERA_LIMITS.maxDistance}
      minPolarAngle={CAMERA_LIMITS.minPolarAngle}
      maxPolarAngle={CAMERA_LIMITS.maxPolarAngle}
      // En el recorrido las transiciones duran ~1,5-3 s (descenso y acercamientos visibles), no un salto.
      smoothTime={reduced ? 0.001 : cinematic ? 1.1 : coarse ? 0.22 : 0.28}
      draggingSmoothTime={reduced ? 0.001 : coarse ? 0.08 : 0.12}
      // Tactil: un dedo orbita, dos dedos hacen zoom (pellizco) y panoramica; giro algo mas fino.
      azimuthRotateSpeed={coarse ? 0.8 : 1}
      polarRotateSpeed={coarse ? 0.8 : 1}
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

type SceneProps = Omit<TwinProps, "quality" | "className" | "cameraPreset" | "dataMode"> & {
  /** Vista Atrio: corte de seccion. */
  section: boolean;
  profile: "high" | "low";
  reduced: boolean;
  /** Modo datos efectivo (prop, preset Atrio o piso aislado). */
  dataMode: boolean;
  presetReq: PresetRequest | null;
  initialPreset: TwinPresetId;
  /** Informa que geometria se dibuja (rotulo y inspector). */
  onSource?: (source: "glb" | "procedural") => void;
};

function Scene({
  campus,
  live,
  layer,
  selectedSpaceId,
  onSelectSpace,
  onSelectLevel,
  focusSpaceIds,
  exploded = false,
  isolatedLevel = null,
  night = false,
  section,
  profile,
  reduced,
  dataMode,
  presetReq,
  initialPreset,
  onSource,
  onUserInteract,
  cinematic,
  model,
  clip,
}: SceneProps & { model: TwinModel | null; clip: Plane }) {
  const gl = useThree((st) => st.gl);
  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = false;
    };
  }, [gl]);
  const sectionZ = sectionCutZ(DIMS);
  const procedural = model === null;
  const settings = profileSettings(profile);
  const shadows = settings.shadows;
  useEffect(() => {
    onSource?.(procedural ? "procedural" : "glb");
  }, [procedural, onSource]);
  useEffect(() => {
    if (!VISUAL_TEST || !model) return undefined;
    DEBUG_REG.glb = model;
    return () => {
      DEBUG_REG.glb = null;
    };
  }, [model]);

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
  const building = useMemo(
    () => buildBuilding(DIMS, computeLayout(campus, DIMS, 0), settings.context, procedural),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey, settings.context, procedural],
  );
  // Encuadre de la vista Atrio: atrio, nucleo y 4 niveles.
  const atriumBox = useMemo(() => {
    const f = sectionFrameBox(DIMS);
    return new Box3(new Vector3(f.min.x, f.min.y, f.min.z), new Vector3(f.max.x, f.max.y, f.max.z));
  }, []);

  const liveMap = useMemo(() => liveBySpaceId(live), [live]);
  const spaceCap = useMemo(() => new Map(campus.spaces.map((s) => [s.id, s.capacity])), [campus]);
  const [hoveredId, setHovered] = useState<string | null>(null);
  const [pickHover, setPickHover] = useState(false);

  const res = useMemo<Resources>(() => {
    const box = new BoxGeometry(1, 1, 1);
    const hill = buildHillRing();
    const hills = new BufferGeometry();
    hills.setAttribute("position", new BufferAttribute(hill.positions, 3));
    hills.setIndex(new BufferAttribute(hill.indices, 1));
    hills.computeVertexNormals();
    return {
      box,
      plane: new PlaneGeometry(1, 1),
      ground: new CircleGeometry(420, 64),
      hills,
      sky: new SphereGeometry(600, 24, 16),
      edges: new EdgesGeometry(box),
      lineSelected: new LineBasicMaterial({ color: PALETTE.gold, toneMapped: false, clippingPlanes: [clip] }),
      lineHover: new LineBasicMaterial({ color: PALETTE.cyan, toneMapped: false, clippingPlanes: [clip] }),
    };
  }, [clip]);
  const mats = useMemo(() => createMats(clip), [clip]);
  useEffect(
    () => () => {
      res.box.dispose();
      res.plane.dispose();
      res.ground.dispose();
      res.hills.dispose();
      res.sky.dispose();
      res.edges.dispose();
      res.lineSelected.dispose();
      res.lineHover.dispose();
    },
    [res],
  );
  useEffect(() => () => disposeMats(mats), [mats]);

  const anim = useRef<Anim>({ night: night ? 1 : 0, data: dataMode ? 1 : 0, section: section ? 1 : 0 });

  const pickLevel = useMemo(() => {
    if (!onSelectLevel) return null;
    return (index: number) => {
      const level = floors[index]?.level;
      if (level === undefined || level === isolatedLevel) return;
      onSelectLevel(level);
    };
  }, [onSelectLevel, floors, isolatedLevel]);

  const ctx = useMemo<SceneCtx>(
    () => ({
      res,
      mats,
      anim,
      procedural,
      model,
      glb: model,
      building,
      floors,
      spaceCap,
      layer,
      liveMap,
      selectedId: selectedSpaceId,
      hoveredId,
      night,
      dataMode,
      reduced,
      exploded,
      isolatedLevel,
      shadows,
      section,
      clip,
      sectionZ,
      setHovered,
      setPickHover,
      select: onSelectSpace,
      pickLevel,
    }),
    [
      res, mats, procedural, model, building, floors, spaceCap, layer, liveMap, selectedSpaceId, hoveredId,
      night, dataMode, reduced, exploded, isolatedLevel, shadows, section, clip, sectionZ, onSelectSpace, pickLevel,
    ],
  );

  return (
    <Ctx.Provider value={ctx}>
      <Atmosphere shadows={shadows} shadowMapSize={settings.shadowMapSize} />
      {/* Entorno reflejado local (sin HDRI remoto): cielo, horizonte de cerros, sol y rebote del suelo. */}
      <Environment frames={1} resolution={settings.envResolution}>
        <color attach="background" args={["#05080F"]} />
        <Lightformer form="rect" intensity={2.4} color={ENV_COLORS.sky} position={[0, 40, 0]} scale={[110, 110, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color={ENV_COLORS.horizon} position={[0, 4, 60]} scale={[160, 14, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={1.2} color={ENV_COLORS.horizon} position={[-60, 4, 0]} scale={[160, 14, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={1.2} color={ENV_COLORS.horizon} position={[60, 4, 0]} scale={[160, 14, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={1.0} color={ENV_COLORS.horizon} position={[0, 4, -60]} scale={[160, 14, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={2.6} color="#FFF4E0" position={[SUN_POSITION[0], SUN_POSITION[1], SUN_POSITION[2]]} scale={[16, 16, 1]} target={[0, 10, 0]} />
        <Lightformer form="rect" intensity={0.7} color="#59606B" position={[0, -30, 0]} scale={[150, 150, 1]} target={[0, 0, 0]} />
      </Environment>

      <mesh geometry={res.sky} material={mats.sky} renderOrder={-10} frustumCulled={false} raycast={noRaycast} />
      {/* Con GLB el suelo del contexto (GROUND, y = -0,2) se dibuja encima; este disco queda debajo como respaldo. */}
      <mesh geometry={res.ground} material={mats.ground} rotation-x={-Math.PI / 2} position-y={procedural ? -0.2 : -0.32} receiveShadow={shadows} raycast={noRaycast} />
      <mesh geometry={res.hills} material={mats.hills} frustumCulled={false} raycast={noRaycast} />

      {procedural ? <Batches /> : <GlbBuilding />}
      {!procedural && section && model ? <ElevatorIndicator floors={floors} /> : null}
      {!procedural ? (
        <GlbBoundary fallback={null}>
          <Suspense fallback={null}>
            <GlbContext url={CONTEXT_URL} profile={profile} shadows={shadows} />
          </Suspense>
        </GlbBoundary>
      ) : null}
      <DrawCallProbe />

      {floors.map((f) => (
        <FloorGroup key={f.level} floor={f} />
      ))}

      <CameraRig
        floors={floors}
        bounds={bounds}
        atriumBox={atriumBox}
        presetReq={presetReq}
        initialPreset={initialPreset}
        selectedId={selectedSpaceId}
        focusIds={focusSpaceIds ?? []}
        exploded={exploded}
        isolatedLevel={isolatedLevel}
        reduced={reduced}
        coarse={profile === "low"}
        onUserInteract={onUserInteract}
        cinematic={cinematic ?? false}
      />
      <CursorSync pointer={hoveredId !== null || pickHover} />
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

/** Respaldo automatico: si el GLB falla (red, archivo corrupto, WebGL), se dibuja la geometria procedural. */
class GlbBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail?: (e: unknown) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("[twin] No se pudo cargar o construir el GLB; se usa la geometria procedural.", error);
    this.props.onFail?.(error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function newClipPlane(): Plane {
  return new Plane(new Vector3(0, 0, -1), 1000);
}

/** Escena con el modelo GLB (suspende mientras carga; lanza si falla). */
function GlbScene(props: SceneProps) {
  const clip = useMemo(newClipPlane, []);
  const shadows = profileSettings(props.profile).shadows;
  const bands = useMemo(() => floorBandsFor(props.campus, DIMS), [props.campus]);
  const urls = glbUrlsForProfile(props.profile, { high: MODEL_URL ?? "", low: MODEL_URL_MOBILE, context: CONTEXT_URL });
  const model = useTwinModel(urls.building, bands, clip, shadows);
  return <Scene {...props} model={model} clip={clip} />;
}

/** Escena con la geometria procedural (modo provisional y respaldo del GLB). */
function ProceduralScene(props: SceneProps) {
  const clip = useMemo(newClipPlane, []);
  return <Scene {...props} model={null} clip={clip} />;
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

const chip: CSSProperties = {
  borderRadius: 6,
  background: "rgba(23,36,58,.82)",
  border: `1px solid ${PALETTE.border}`,
  color: "#B8C4D8",
  font: '500 11px/1.4 "IBM Plex Sans", system-ui, sans-serif',
};

/**
 * Solo pruebas visuales automatizadas (?visualtest en la URL): conserva el buffer de
 * dibujo para leer los pixeles reales del fotograma WebGL. No se activa en uso normal.
 */
const VISUAL_TEST = typeof location !== "undefined" && new URLSearchParams(location.search).has("visualtest");
/** Log de draw calls reales (renderer.info) en desarrollo o con ?visualtest. */
const LOG_DRAWS = VISUAL_TEST || import.meta.env.DEV;

/** Registro para el inspector de pruebas visuales (solo se usa con ?visualtest). */
const DEBUG_REG: {
  batches: { refs: Partial<Record<BatchKey, InstancedMesh | null>>; building: Building; win: InstancedMesh | null } | null;
  spaces: Set<string>;
  glb: TwinModel | null;
  drawCalls: number;
  triangles: number;
} = { batches: null, spaces: new Set(), glb: null, drawCalls: 0, triangles: 0 };

export default function CampusTwin({
  campus,
  live,
  layer,
  selectedSpaceId,
  onSelectSpace,
  onSelectLevel,
  focusSpaceIds,
  exploded,
  isolatedLevel,
  night,
  dataMode,
  cameraPreset,
  onPresetChange,
  viewResetToken,
  onUserInteract,
  cinematic,
  onModelState,
  quality = "auto",
  className,
}: TwinProps) {
  const reduced = usePrefersReducedMotion();
  const [source, setSource] = useState<"loading" | "glb" | "procedural">(MODEL_URL === null ? "procedural" : "loading");
  const modelStateRef = useRef(onModelState);
  modelStateRef.current = onModelState;
  useEffect(() => {
    modelStateRef.current?.(source);
  }, [source]);
  const profile = useMemo(
    () => resolveProfile(quality, typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined),
    [quality],
  );
  const settings = profileSettings(profile);
  const [dpr, setDpr] = useState<[number, number]>(settings.dpr);
  const effectiveDpr = profile === "low" ? settings.dpr : dpr;

  const [preset, setPreset] = useState<TwinPresetId>(cameraPreset ?? "facade");
  const [presetReq, setPresetReq] = useState<PresetRequest | null>(null);
  const initialPreset = useRef<TwinPresetId>(cameraPreset ?? "facade").current;

  // Modo Referencia: comparacion VOLUNTARIA con una foto local (object URL; nunca se sube).
  const [cmp, dispatchCmp] = useReducer(reduceCompare, initialCompareState);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const slotRef = useRef<PhotoSlot | null>(null);
  const getSlot = (): PhotoSlot => {
    if (!slotRef.current) {
      slotRef.current = createPhotoSlot({
        createObjectURL: (b) => URL.createObjectURL(b),
        revokeObjectURL: (u) => URL.revokeObjectURL(u),
      });
    }
    return slotRef.current;
  };
  const leaveReference = () => {
    slotRef.current?.release();
    dispatchCmp({ type: "reset" });
    setPhotoError(null);
  };
  useEffect(() => {
    return () => {
      slotRef.current?.release();
    };
  }, []);

  /** Aplica un preset localmente (camara + estado de Referencia), sin notificar al padre. */
  const applyLocal = (id: TwinPresetId) => {
    if (preset === "reference" && id !== "reference") leaveReference();
    setPreset(id);
    setPresetReq((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  };
  const choose = (id: TwinPresetId) => {
    applyLocal(id);
    onPresetChange?.(id);
  };
  const referenceActive = preset === "reference";
  const sectionActive = preset === "atrium";

  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () =>
      setBox((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
    };
  }, []);
  const frame = referenceActive && box.w > 0 && box.h > 0 ? letterboxRect(box.w, box.h) : null;
  const silhouette = useMemo(
    () =>
      referenceSilhouette({
        min: { x: -DIMS.footprintW / 2, y: 0, z: -DIMS.footprintD / 2 },
        max: { x: DIMS.footprintW / 2, y: crownTopY(floorLevels(campus).length, DIMS), z: DIMS.footprintD / 2 },
      }),
    [campus],
  );
  const onFile = (file: File) => {
    if (!isImageFile(file)) {
      setPhotoError("El archivo elegido no es una imagen.");
      return;
    }
    setPhotoError(null);
    dispatchCmp({ type: "load", url: getSlot().set(file) });
  };
  const onPhotoError = () => {
    slotRef.current?.release();
    dispatchCmp({ type: "clear" });
    setPhotoError("No se pudo leer esa imagen. Prueba con otra.");
  };
  const lastPropPreset = useRef(cameraPreset);
  useEffect(() => {
    // El padre (maquina de estados) cambio el preset, p. ej. al aislar un piso estando en
    // Atrio/Referencia: se aplica localmente sin volver a notificar (sin bucles).
    if (cameraPreset && cameraPreset !== lastPropPreset.current && cameraPreset !== preset) applyLocal(cameraPreset);
    lastPropPreset.current = cameraPreset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPreset]);
  const lastReset = useRef(viewResetToken);
  useEffect(() => {
    // "Restablecer vista": camara inicial (Fachada) aunque ya estuviera en Fachada.
    if (viewResetToken !== undefined && viewResetToken !== lastReset.current) applyLocal("facade");
    lastReset.current = viewResetToken;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewResetToken]);

  const effectiveData = Boolean(dataMode) || preset === "atrium" || (isolatedLevel ?? null) !== null;

  // Inspector de geometria real para pruebas visuales (?visualtest): clasifica cada instancia
  // por la escala de su matriz: oculta (3 ejes ~0), degenerada (algun eje 0 pero no todos ->
  // plano con normal NaN, la causa de las "losas negras") o visible (solo si la malla se dibuja).
  useEffect(() => {
    if (!VISUAL_TEST) return undefined;
    const w = window as unknown as { __twinDebug?: () => unknown };
    w.__twinDebug = () => {
      const m = new Matrix4();
      const visibleByLevel: Record<string, number> = {};
      const hiddenByLevel: Record<string, number> = {};
      let degenerate = 0;
      const reg = DEBUG_REG.batches;
      if (reg) {
        for (const key of BATCH_KEYS) {
          const im = reg.refs[key];
          const list = reg.building.boxes[key];
          if (!im || !list) continue;
          list.forEach((b, i) => {
            if (b.level < 0) return;
            im.getMatrixAt(i, m);
            const e = m.elements;
            const sc = [Math.hypot(e[0]!, e[1]!, e[2]!), Math.hypot(e[4]!, e[5]!, e[6]!), Math.hypot(e[8]!, e[9]!, e[10]!)];
            const zeros = sc.filter((v) => v < 1e-6).length;
            const lv = String(b.level + 1);
            if (zeros === 3) hiddenByLevel[lv] = (hiddenByLevel[lv] ?? 0) + 1;
            else if (zeros > 0) degenerate++;
            else if (im.visible) visibleByLevel[lv] = (visibleByLevel[lv] ?? 0) + 1;
          });
        }
      }
      const common = {
        isolatedLevel: isolatedLevel ?? null,
        preset,
        exploded: Boolean(exploded),
        spacesDrawn: [...DEBUG_REG.spaces],
        source,
        drawCalls: DEBUG_REG.drawCalls,
        triangles: DEBUG_REG.triangles,
      };
      const glb = DEBUG_REG.glb;
      if (source === "glb" && glb) {
        // GLB: mallas visibles (cadena de padres) bajo cada FLOOR_Pxx y mallas con escala degenerada.
        const snap = glbDebugSnapshot(glb);
        return { ...common, degenerate: snap.degenerate, visibleByLevel: snap.visibleByLevel, hiddenByLevel: {}, renderMode: snap.renderMode, stats: snap.stats };
      }
      return { ...common, degenerate, visibleByLevel, hiddenByLevel };
    };
    return () => {
      delete w.__twinDebug;
    };
  }, [isolatedLevel, preset, exploded, source]);

  const provisional = campus.building.geometry_provisional || source !== "glb";
  const sourceLabel =
    source === "glb"
      ? `Modelo 3D de Blender (${profile === "low" ? "LOD móvil" : "LOD completo"})`
      : source === "procedural"
        ? MODEL_URL === null
          ? "Geometría procedural"
          : "Geometría procedural (respaldo: el modelo GLB no cargó)"
        : "Cargando modelo 3D…";
  const label = useMemo(
    () => describeTwin(campus, live, layer, provisional),
    [campus, live, layer, provisional],
  );
  const lines = useMemo(() => describeSpaces(campus, live, layer), [campus, live, layer]);
  const emptyLevels = useMemo(() => describeEmptyLevels(campus, floorLevels(campus)), [campus]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sceneProps: SceneProps = {
    campus,
    live,
    layer,
    selectedSpaceId,
    onSelectSpace,
    ...(onSelectLevel ? { onSelectLevel } : {}),
    ...(focusSpaceIds ? { focusSpaceIds } : {}),
    ...(exploded !== undefined ? { exploded } : {}),
    ...(isolatedLevel !== undefined ? { isolatedLevel } : {}),
    ...(night !== undefined ? { night } : {}),
    section: sectionActive,
    profile,
    reduced,
    dataMode: effectiveData,
    presetReq,
    initialPreset,
    onSource: setSource,
    ...(onUserInteract ? { onUserInteract } : {}),
    ...(cinematic !== undefined ? { cinematic } : {}),
  };
  const isolatedHasNoSpaces =
    isolatedLevel !== null && isolatedLevel !== undefined && !campus.spaces.some((s) => s.level === isolatedLevel);

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 280, background: PALETTE.bg, overflow: "hidden" }}>
      <div
        role="img"
        aria-label={label}
        style={frame ? { position: "absolute", left: frame.x, top: frame.y, width: frame.size, height: frame.size } : fill}
      >
        <OverlayCtx.Provider value={overlayRef}>
        <TwinErrorBoundary>
          <Canvas
            shadows={settings.shadows ? "percentage" : false}
            dpr={effectiveDpr}
            camera={{ fov: 35, near: 0.5, far: 800, position: [-38, 37, 66] }}
            gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, powerPreference: "high-performance", preserveDrawingBuffer: VISUAL_TEST }}
            onPointerMissed={() => onSelectSpace(null)}
            style={{ touchAction: "none" }}
          >
            <color attach="background" args={[PALETTE.bg]} />
            <fog attach="fog" args={[SKY.dayHorizon, 140, 520]} />
            {quality === "auto" && profile === "high" ? (
              <PerformanceMonitor
                flipflops={3}
                onDecline={() => setDpr([1, 1.25])}
                onIncline={() => setDpr(settings.dpr)}
                onFallback={() => setDpr([1, 1])}
              />
            ) : null}
            <Suspense fallback={null}>
              {MODEL_URL === null ? (
                <ProceduralScene {...sceneProps} />
              ) : (
                <GlbBoundary
                  onFail={() => {
                    setSource("procedural");
                  }}
                  fallback={<ProceduralScene {...sceneProps} />}
                >
                  <GlbScene {...sceneProps} />
                </GlbBoundary>
              )}
            </Suspense>
          </Canvas>
        </TwinErrorBoundary>
        </OverlayCtx.Provider>
        {/* React no gestiona hijos de este div: lo usa drei <Html> como portal. */}
        <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
      </div>

      <div
        role="group"
        aria-label="Vistas de cámara"
        style={{ position: "absolute", top: 8, left: 8, display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "calc(100% - 16px)" }}
      >
        {TWIN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            aria-label={p.description}
            title={p.description}
            onClick={() => choose(p.id)}
            style={{
              ...chip,
              minHeight: 32,
              minWidth: 44,
              padding: "4px 10px",
              cursor: "pointer",
              color: preset === p.id ? PALETTE.bg : PALETTE.text,
              background: preset === p.id ? PALETTE.cyan : "rgba(23,36,58,.82)",
              borderColor: preset === p.id ? PALETTE.cyan : PALETTE.border,
              fontWeight: 600,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {referenceActive ? (
        <>
          <ReferenceOverlay
            state={cmp}
            rect={frame ?? { x: 0, y: 0, size: Math.min(box.w, box.h) }}
            silhouette={silhouette}
            onPhotoError={onPhotoError}
          />
          <ReferencePanel
            state={cmp}
            error={photoError}
            narrow={box.w < 560}
            onFile={onFile}
            onMode={(mode) => dispatchCmp({ type: "mode", mode })}
            onOpacity={(value) => dispatchCmp({ type: "opacity", value })}
            onGuides={(guides) => dispatchCmp({ type: "guides", guides })}
            onClear={() => {
              slotRef.current?.release();
              dispatchCmp({ type: "clear" });
            }}
            onExit={() => choose("facade")}
          />
        </>
      ) : null}

      {isolatedLevel !== null && isolatedLevel !== undefined ? (
        <p role="status" style={{ ...chip, position: "absolute", top: 48, left: 8, margin: 0, padding: "3px 9px", color: PALETTE.text }}>
          Piso {isolatedLevel}
          {isolatedHasNoSpaces ? ` · ${NO_SPACES_LABEL}` : ""}
        </p>
      ) : null}

      {sectionActive ? (
        <p role="note" style={{ ...chip, position: "absolute", left: 10, bottom: 30, margin: 0, padding: "2px 8px", maxWidth: "calc(100% - 20px)", pointerEvents: "none", color: PALETTE.gold }}>
          {INTERIOR_NOTICE}
        </p>
      ) : null}

      <p
        style={{
          ...chip,
          position: "absolute",
          left: 10,
          bottom: 8,
          margin: 0,
          padding: "2px 8px",
          maxWidth: "calc(100% - 20px)",
          pointerEvents: "none",
        }}
      >
        {sourceLabel} · {APPROX_NOTICE}
      </p>

      <ul style={srOnly} aria-label="Espacios y estados">
        {lines.map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
        {emptyLevels.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
