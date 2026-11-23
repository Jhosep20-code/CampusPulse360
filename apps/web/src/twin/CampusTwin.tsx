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
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Group,
} from "three";
import { describeEmptyLevels, describeSpaces, describeTwin, liveBySpaceId } from "./a11y";
import { STATUS_LABEL, colorForSpace, emissiveForNight, primaryValueLabel } from "./colors";
import {
  APPROX_NOTICE,
  DEFAULT_DIMS,
  MODEL_URL,
  NO_SPACES_LABEL,
  PALETTE,
  type BuildingDims,
} from "./constants";
import { buildHillRing } from "./environment";
import { BATCH_KEYS, BATCH_META, buildBuilding, type BatchKey, type Building } from "./facade";
import { atriumRect, computeLayout, coreRect, crownTopY, floorLevels } from "./layout";
import {
  DAY_COLORS,
  ENV_COLORS,
  MATERIAL_SPECS,
  NIGHT_COLORS,
  SKY,
  SUN_POSITION,
  WINDOW_LIT,
} from "./materials";
import { profileSettings, resolveProfile } from "./profile";
import type { TwinLayer, TwinProps } from "./types";
import { useTwinModel, type TwinModel } from "./useTwinModel";
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
  /** Origen Y compacto y explotado. */
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
      return { level: f.level, index: f.index, y0: f.y, y1: exploded.floors[i]?.y ?? f.y, height: f.height, geoms };
    });
    const b = compact.bounds;
    return {
      floors,
      bounds: new Box3(new Vector3(b.minX, 0, b.minZ), new Vector3(b.maxX, b.maxY, b.maxZ)),
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
      geoms.push({ space, level, pos: [c.x, c.y, c.z], size: [s.x, s.y, s.z], mesh });
    }
    return { level, index, y0: 0, y1: index * dims.explodeGap, height: dims.floorHeight, geoms };
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

function createMats(): Mats {
  const batch = {} as Record<BatchKey, Material>;
  for (const k of BATCH_KEYS) {
    const s = MATERIAL_SPECS[k];
    if (k === "led" || k === "lampHead") {
      batch[k] = new MeshBasicMaterial({ color: s.color, toneMapped: false });
    } else if (k === "glass") {
      batch[k] = new MeshPhysicalMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: s.metalness,
        clearcoat: s.clearcoat ?? 0.6,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.8,
        transparent: true,
        opacity: s.opacity,
        depthWrite: false,
      });
    } else {
      batch[k] = new MeshStandardMaterial({ color: s.color, roughness: s.roughness, metalness: s.metalness });
    }
  }
  return {
    batch,
    windows: new MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
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
  ctxNight: new Color(MATERIAL_SPECS.context.color),
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

const OPACITY_KEYS = ["glass", "white", "frame", "glassGround"] as const;

/** Actualiza los materiales segun la transicion dia/noche y realista/datos. */
function updateMats(m: Mats, a: Anim): void {
  for (const k of OPACITY_KEYS) {
    const mat = m.batch[k] as MeshStandardMaterial;
    const s = MATERIAL_SPECS[k];
    const op = MathUtils.lerp(s.opacity, s.opacityData, a.data);
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
    ) => {
      let yy = y;
      let ss = sy;
      if (level >= 0) {
        const v = vis.current[level] ?? 1;
        const base = building.levelBase[level] ?? 0;
        yy = base + (y - base) * v + level * gap * expl.current;
        ss = v < 0.003 ? 0 : sy * v;
      }
      DUMMY.position.set(x, yy, z);
      DUMMY.rotation.set(0, ry, 0);
      DUMMY.scale.set(sx, ss, sz);
      DUMMY.updateMatrix();
      im.setMatrixAt(i, DUMMY.matrix);
    };
    for (const key of BATCH_KEYS) {
      const im = refs.current[key];
      const list = building.boxes[key];
      if (!im || list.length === 0) continue;
      if (!force && staticOnly.has(key)) continue;
      list.forEach((b, i) => place(im, i, b.level, b.x, b.y, b.z, b.sx, b.sy, b.sz, b.ry ?? 0));
      im.instanceMatrix.needsUpdate = true;
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
    const showInterior = anim.current.data > 0.02;
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
        const receive = key === "white" || key === "slab" || key === "roof" || key === "sidewalk" || key === "asphalt";
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

    // En modo realista el volumen es un tinte tenue tras el vidrio; en modo datos se ve completo.
    const baseOpacity = MathUtils.lerp(0.16, 0.5, ctx.anim.current.data);
    const targetOpacity = faded ? 0.04 : selected ? 0.82 : hovered ? 0.72 : baseOpacity;
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
        userData={{ spaceId: space.id }}
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
      userData={{ spaceId: space.id }}
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

/** Volumenes de espacio, contornos y etiquetas de un piso (la estructura va en Batches). */
function FloorGroup({ floor }: { floor: FloorInfo }) {
  const ctx = useCtx();
  const { res } = ctx;
  const groupRef = useRef<Group>(null);
  const tRef = useRef(ctx.exploded ? 1 : 0);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const tTarget = ctx.exploded ? 1 : 0;
    tRef.current = ctx.reduced ? tTarget : MathUtils.damp(tRef.current, tTarget, 4, dt);
    g.position.y = floor.y0 + (floor.y1 - floor.y0) * tRef.current;
  });

  const labelGeoms = floor.geoms.filter((g) => {
    if (ctx.isolatedLevel !== null && ctx.isolatedLevel !== floor.level) return false;
    return g.space.id === ctx.selectedId || ctx.liveMap.get(g.space.id)?.status === "critical";
  });
  const outlines = floor.geoms.filter((g) => g.space.id === ctx.selectedId || g.space.id === ctx.hoveredId);

  return (
    <group ref={groupRef} position={[0, floor.y0, 0]}>
      {!ctx.procedural
        ? (ctx.model?.floorNodes.get(floor.level) ?? []).map((n) => <primitive key={n.uuid} object={n} />)
        : null}

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

/** Luces, transicion dia/noche, niebla y entorno reflejado. Debe montarse antes que Batches. */
function Atmosphere({ shadows, shadowMapSize }: { shadows: boolean; shadowMapSize: number }) {
  const ctx = useCtx();
  const scene = useThree((s) => s.scene);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);

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

    updateMats(ctx.mats, a);
    if (hemi.current) hemi.current.intensity = MathUtils.lerp(0.62, 0.16, a.night);
    if (sun.current) {
      sun.current.intensity = MathUtils.lerp(2.4, 0.25, a.night);
      sun.current.color.lerpColors(DAY_SUN, NIGHT_MOON, a.night);
    }
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
}: {
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
    const y = expl ? f.y1 : f.y0;
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
      smoothTime={reduced ? 0.001 : 0.28}
      draggingSmoothTime={reduced ? 0.001 : 0.12}
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
  profile: "high" | "low";
  reduced: boolean;
  /** Modo datos efectivo (prop, preset Atrio o piso aislado). */
  dataMode: boolean;
  presetReq: PresetRequest | null;
  initialPreset: TwinPresetId;
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
  profile,
  reduced,
  dataMode,
  presetReq,
  initialPreset,
}: SceneProps) {
  const model = useTwinModel();
  const procedural = model === null;
  const settings = profileSettings(profile);
  const shadows = settings.shadows;

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
  const atriumBox = useMemo(() => {
    const a = atriumRect(DIMS);
    const k = coreRect(DIMS);
    return new Box3(
      new Vector3(a.minX, 0, a.minZ),
      new Vector3(k.maxX, crownTopY(floors.length, DIMS), a.maxZ),
    );
  }, [floors.length]);

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
      lineSelected: new LineBasicMaterial({ color: PALETTE.gold, toneMapped: false }),
      lineHover: new LineBasicMaterial({ color: PALETTE.cyan, toneMapped: false }),
    };
  }, []);
  const mats = useMemo(() => createMats(), []);
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

  const anim = useRef<Anim>({ night: night ? 1 : 0, data: dataMode ? 1 : 0 });

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
      setHovered,
      setPickHover,
      select: onSelectSpace,
      pickLevel,
    }),
    [
      res, mats, procedural, model, building, floors, spaceCap, layer, liveMap, selectedSpaceId, hoveredId,
      night, dataMode, reduced, exploded, isolatedLevel, shadows, onSelectSpace, pickLevel,
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
      <mesh geometry={res.ground} material={mats.ground} rotation-x={-Math.PI / 2} position-y={-0.2} receiveShadow={shadows} raycast={noRaycast} />
      <mesh geometry={res.hills} material={mats.hills} frustumCulled={false} raycast={noRaycast} />

      {procedural ? <Batches /> : model ? <primitive object={model.facade} /> : null}

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
  quality = "auto",
  className,
}: TwinProps) {
  const reduced = usePrefersReducedMotion();
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
  const choose = (id: TwinPresetId) => {
    setPreset(id);
    setPresetReq((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  };
  const lastPropPreset = useRef(cameraPreset);
  useEffect(() => {
    if (cameraPreset && cameraPreset !== lastPropPreset.current) choose(cameraPreset);
    lastPropPreset.current = cameraPreset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPreset]);

  const effectiveData = Boolean(dataMode) || preset === "atrium" || (isolatedLevel ?? null) !== null;

  const provisional = campus.building.geometry_provisional || MODEL_URL === null;
  const label = useMemo(
    () => describeTwin(campus, live, layer, provisional),
    [campus, live, layer, provisional],
  );
  const lines = useMemo(() => describeSpaces(campus, live, layer), [campus, live, layer]);
  const emptyLevels = useMemo(() => describeEmptyLevels(campus, floorLevels(campus)), [campus]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isolatedHasNoSpaces =
    isolatedLevel !== null && isolatedLevel !== undefined && !campus.spaces.some((s) => s.level === isolatedLevel);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 280, background: PALETTE.bg, overflow: "hidden" }}>
      <div role="img" aria-label={label} style={fill}>
        <OverlayCtx.Provider value={overlayRef}>
        <TwinErrorBoundary>
          <Canvas
            shadows={settings.shadows ? "percentage" : false}
            dpr={effectiveDpr}
            camera={{ fov: 35, near: 0.5, far: 800, position: [-38, 37, 66] }}
            gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, powerPreference: "high-performance" }}
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
              <Scene
                campus={campus}
                live={live}
                layer={layer}
                selectedSpaceId={selectedSpaceId}
                onSelectSpace={onSelectSpace}
                {...(onSelectLevel ? { onSelectLevel } : {})}
                {...(focusSpaceIds ? { focusSpaceIds } : {})}
                {...(exploded !== undefined ? { exploded } : {})}
                {...(isolatedLevel !== undefined ? { isolatedLevel } : {})}
                {...(night !== undefined ? { night } : {})}
                profile={profile}
                reduced={reduced}
                dataMode={effectiveData}
                presetReq={presetReq}
                initialPreset={initialPreset}
              />
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

      {isolatedLevel !== null && isolatedLevel !== undefined ? (
        <p role="status" style={{ ...chip, position: "absolute", top: 48, left: 8, margin: 0, padding: "3px 9px", color: PALETTE.text }}>
          Piso {isolatedLevel}
          {isolatedHasNoSpaces ? ` · ${NO_SPACES_LABEL}` : ""}
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
        {MODEL_URL === null ? APPROX_NOTICE : "Modelo 3D del edificio"}
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
