import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Quaternion,
  Vector3,
  type Intersection,
  type Material,
  type Raycaster,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DAY_COLORS, MATERIAL_SPECS, NIGHT_COLORS, WINDOW_LIT } from "./materials";
import {
  MERGE_CLASS,
  mergeClassOf,
  GLB_MATERIAL_KEY,
  GLB_NO_SHADOW,
  GLB_OPACITY_MATERIALS,
  SLICED_GROUPS,
  classifyNode,
  contextMaterialAllowed,
  floorNodeName,
  planMerge,
  sliceRange,
  windowSpaceMeshId,
  type FloorBand,
  type MergeItem,
  type SharedGroup,
} from "./glb";

/*
 * Construye, a partir del GLB de Blender (assets/3d/README.md), la escena del gemelo:
 *  - WHOLE: todo el edificio fusionado por material (~20 mallas) para la vista normal;
 *  - un grupo FLOOR_Pxx por piso con su estructura fusionada por material, las ventanas
 *    nocturnas de cada espacio, los volumenes SPC_* y "rebanadas" de los grupos
 *    compartidos (FACADE, ATRIUM, STAIRS, ELEVATORS) recortadas a la franja del piso con
 *    clipping planes; ROOF viaja con el ultimo piso.
 * Aislar un piso es group.visible = false y explotar es position.y: JAMAS se escalan matrices
 * (leccion de las "losas negras", ver instancing.ts). Sin React ni DOM.
 */

export interface GlbAnim {
  /** 0 = dia, 1 = noche. */
  night: number;
  /** 0 = realista, 1 = modo datos. */
  data: number;
  /** 0 = edificio completo, 1 = corte de seccion. */
  section: number;
}

export interface GlbBuildOptions {
  bands: readonly FloorBand[];
  /** Plano de seccion de la vista Atrio, compartido por todos los materiales recortables. */
  clip: Plane;
  shadows: boolean;
}

export interface GlbFloor {
  level: number;
  index: number;
  baseY: number;
  height: number;
  /** Grupo FLOOR_Pxx: su visibilidad aisla el piso y su position.y lo explota. */
  group: Group;
  /** Estructura y rebanadas: solo se dibujan en "modo pisos" (aislado o explotado). */
  parts: Mesh[];
  /** Ventanas nocturnas por espacio (siempre activas; opacidad = noche). */
  windows: Mesh[];
  /** Planos de la franja del piso (recortan las rebanadas compartidas). */
  lo: Plane;
  hi: Plane;
  /** Limites de la franja en reposo. */
  range: { lo: number; hi: number };
}

export interface GlbModel {
  /** Edificio completo fusionado por material (modo normal). */
  whole: Group;
  floors: Map<number, GlbFloor>;
  /** mesh_id -> volumen de espacio (hijo de su FLOOR_Pxx, en coordenadas locales = de mundo en reposo). */
  spaces: Map<string, Mesh>;
  /** mesh_id -> ancla del sensor (coordenadas de edificio, en reposo). */
  anchors: Map<string, Vector3>;
  bands: FloorBand[];
  bounds: Box3;
  mats: GlbMaterials;
  stats: { sourceMeshes: number; wholeMeshes: number; floorMeshes: number; windowMeshes: number };
  dispose: () => void;
}

/* ------------------------------------------------------------ raycast */

/** Una malla no se dibuja si ella o un ancestro tiene visible = false; three NO lo comprueba al hacer raycast. */
export function effectivelyVisible(obj: Object3D, ignoreSwap: boolean): boolean {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    if (!o.visible && !(ignoreSwap && o.userData["swapHidden"] === true)) return false;
  }
  return true;
}

export function guardedRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]): void {
  if (!effectivelyVisible(this, false)) return;
  const m = this.material;
  if (!Array.isArray(m) && !m.visible) return;
  Mesh.prototype.raycast.call(this, raycaster, intersects);
}

/* ------------------------------------------------------------ materiales */

interface Entry {
  name: string;
  mat: MeshStandardMaterial;
}

const WINDOW_GEN_K = 0.55;
const ALERT_CRITICAL = new Color("#FF3B4E");
const ALERT_WARNING = new Color("#F0B95B");
const WINDOW_EMISSIVE = 1.4;
/** Brillo minimo de servicio de las ventanas de noche (fraccion del maximo). */
export const WINDOW_SERVICE_K = 0.28;

export class GlbMaterials {
  /** Nombre de Blender -> material principal (sin recorte por franja). */
  readonly main = new Map<string, MeshStandardMaterial>();
  /** mesh_id -> material de la ventana nocturna de ese espacio. */
  readonly windowSpace = new Map<string, MeshStandardMaterial>();
  private readonly entries: Entry[] = [];
  constructor(private readonly clip: Plane) {}

  /** Convierte un material de glTF (sin texturas) a uno del visor, conservando el color del modelo. */
  convert(src: Material): MeshStandardMaterial {
    const s = src as MeshStandardMaterial;
    const name = s.name;
    const key = GLB_MATERIAL_KEY[name];
    const spec = key ? MATERIAL_SPECS[key] : undefined;
    let mat: MeshStandardMaterial;
    if (name === "GLASS_CURTAIN" || name === "GLASS_GROUND" || name === "GLASS_CLEAR") {
      const sp = spec ?? MATERIAL_SPECS.glass;
      mat = new MeshPhysicalMaterial({
        color: s.color,
        roughness: sp.roughness,
        metalness: sp.metalness,
        clearcoat: sp.clearcoat ?? 0.6,
        clearcoatRoughness: 0.03,
        envMapIntensity: sp.envMapIntensity ?? 1.8,
        side: s.side,
        transparent: true,
        opacity: sp.opacity,
        depthWrite: false,
      });
    } else if (name === "WINDOW_NIGHT") {
      // Solo emision: de dia opacidad 0 (invisible); de noche se enciende (ver update).
      mat = new MeshStandardMaterial({
        color: "#000000",
        emissive: new Color(WINDOW_LIT).multiplyScalar(WINDOW_GEN_K),
        emissiveIntensity: 0,
        roughness: 1,
        metalness: 0,
        side: DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      mat.visible = false;
    } else {
      const emissive = name === "LED_CROWN" || name === "LIGHT_PANEL";
      mat = new MeshStandardMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: s.metalness,
        side: s.side,
        envMapIntensity: spec?.envMapIntensity ?? 1,
        ...(emissive ? { emissive: s.emissive.clone(), emissiveIntensity: 0.1 } : {}),
      });
    }
    mat.name = name;
    mat.clippingPlanes = [this.clip];
    mat.clipShadows = true;
    return mat;
  }

  /** Material principal para un nombre de Blender (se crea una sola vez). */
  get(src: Material): MeshStandardMaterial {
    let m = this.main.get(src.name);
    if (!m) {
      m = this.convert(src);
      this.main.set(src.name, m);
      this.entries.push({ name: src.name, mat: m });
    }
    return m;
  }

  /** Material de una clase de fusion (MATTE/METAL): color por vertice, propiedades PBR comunes. */
  getClass(cls: string): MeshStandardMaterial {
    let m = this.main.get(cls);
    if (!m) {
      const metal = cls === "METAL";
      m = new MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        roughness: metal ? 0.32 : 0.7,
        metalness: metal ? 0.7 : 0,
        envMapIntensity: metal ? 1.2 : 1,
      });
      m.name = cls;
      m.clippingPlanes = [this.clip];
      m.clipShadows = true;
      this.main.set(cls, m);
      this.entries.push({ name: cls, mat: m });
    }
    return m;
  }

  /** Copia del material principal recortada a la franja Y [lo, hi] de un piso. */
  slice(name: string, lo: Plane, hi: Plane): MeshStandardMaterial {
    const base = this.main.get(name);
    if (!base) throw new Error(`GLB: material ${name} desconocido`);
    const m = base.clone();
    m.clippingPlanes = [this.clip, lo, hi];
    m.clipShadows = true;
    this.entries.push({ name, mat: m });
    return m;
  }

  /** Material de la ventana nocturna de un espacio (copia propia para modular su brillo). */
  windowFor(meshId: string, src: Material): MeshStandardMaterial {
    let m = this.windowSpace.get(meshId);
    if (!m) {
      m = this.get(src).clone();
      m.clippingPlanes = [this.clip];
      m.visible = false;
      this.windowSpace.set(meshId, m);
      this.entries.push({ name: "WINDOW_NIGHT", mat: m });
    }
    return m;
  }

  /** Brillo nocturno de la ventana de un espacio segun su ocupacion (0..1). */
  setWindowGlow(meshId: string, k: number): void {
    const m = this.windowSpace.get(meshId);
    if (!m) return;
    m.userData["glowK"] = k;
    if (!this.alerts.has(meshId)) m.emissive.set(WINDOW_LIT).multiplyScalar(k);
  }

  /** mesh_id -> alerta visible en la fachada (estado calculado por la API). */
  private readonly alerts = new Map<string, "warning" | "critical">();
  private reducedMotion = false;

  /**
   * Alertas por espacio: la ventana de ese espacio se ilumina en dorado (advertencia) o rojo pulsante (critico),
   * tambien de dia, para que la anomalia se vea desde la fachada. Al desaparecer, vuelve a su brillo normal.
   */
  setAlerts(next: ReadonlyMap<string, "warning" | "critical">, reducedMotion = false): void {
    this.reducedMotion = reducedMotion;
    for (const id of [...this.alerts.keys()]) {
      if (next.has(id)) continue;
      this.alerts.delete(id);
      const m = this.windowSpace.get(id);
      if (m) m.emissive.set(WINDOW_LIT).multiplyScalar(typeof m.userData["glowK"] === "number" ? (m.userData["glowK"] as number) : 0);
    }
    for (const [id, lv] of next) this.alerts.set(id, lv);
  }

  /** Para pruebas y el inspector: alertas activas en las ventanas. */
  activeAlerts(): ReadonlyMap<string, "warning" | "critical"> {
    return this.alerts;
  }

  /** Dia/noche, modo datos y corte de seccion. Mismas reglas de opacidad que la ruta procedural. */
  update(a: GlbAnim): void {
    for (const { name, mat } of this.entries) {
      if ((GLB_OPACITY_MATERIALS as readonly string[]).includes(name)) {
        const key = GLB_MATERIAL_KEY[name];
        const s = key ? MATERIAL_SPECS[key] : undefined;
        if (!s) continue;
        // En el corte los muros y la carpinteria se vuelven macizos (no translucidos).
        let op = MathUtils.lerp(s.opacity, s.opacityData, a.data * (1 - a.section));
        // De noche el vidrio del muro cortina deja ver las ventanas encendidas del interior
        // (las ventanas WINDOW_NIGHT estan detras del vidrio, casi opaco de dia).
        if (name === "GLASS_CURTAIN") op = Math.min(op, MathUtils.lerp(op, 0.38, a.night));
        const transparent = op < 0.999;
        mat.opacity = op;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.depthWrite = !transparent;
          mat.needsUpdate = true;
        }
      } else if (name === "WINDOW_NIGHT") {
        mat.opacity = a.night;
        mat.emissiveIntensity = WINDOW_EMISSIVE * a.night;
        mat.visible = a.night > 0.02;
      } else if (name === "LED_CROWN") {
        mat.emissiveIntensity = MathUtils.lerp(0.04, 1.6, a.night);
      } else if (name === "LIGHT_PANEL") {
        // Luz interior moderada: apenas tenue de dia, calida de noche.
        mat.emissiveIntensity = MathUtils.lerp(0.1, 0.55, a.night);
      }
    }
    if (this.alerts.size === 0) return;
    const t = performance.now() / 1000;
    for (const [id, lv] of this.alerts) {
      const m = this.windowSpace.get(id);
      if (!m) continue;
      const pulse = this.reducedMotion ? 1 : lv === "critical" ? 0.5 + 0.5 * Math.sin(t * 4.2) : 0.85 + 0.15 * Math.sin(t * 2.2);
      m.emissive.set(lv === "critical" ? ALERT_CRITICAL : ALERT_WARNING);
      m.emissiveIntensity = (lv === "critical" ? 1.1 : 0.8) + 0.9 * pulse;
      m.opacity = Math.max(m.opacity, lv === "critical" ? 0.55 + 0.35 * pulse : 0.6);
      m.visible = true;
    }
  }

  dispose(): void {
    for (const e of this.entries) e.mat.dispose();
    for (const m of this.windowSpace.values()) m.dispose();
  }
}

/* ------------------------------------------------------------ fusion */

interface Piece {
  geom: BufferGeometry;
  material: Material;
  /** Cubeta de fusion: clase (MATTE/METAL) o nombre del material. */
  matName: string;
  level: number | null;
  shared: SharedGroup | null;
  /** Franja de piso de una pieza compartida ya cortada en Blender (extras band_level); null = sin cortar. */
  band: number | null;
  /** mesh_id del espacio si es una ventana nocturna propia de un espacio. */
  windowOf: string | null;
}

const IDENTITY = new Matrix4();

function bake(mesh: Mesh): BufferGeometry {
  if (mesh.matrixWorld.equals(IDENTITY)) return mesh.geometry;
  return mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
}

/** Deja solo los atributos comunes (y todo no indexado si hace falta) para que mergeGeometries no falle. */
function unify(geoms: BufferGeometry[]): { list: BufferGeometry[]; temp: BufferGeometry[] } {
  const names = [...Object.keys(geoms[0]!.attributes)].filter((n) => geoms.every((g) => g.attributes[n] !== undefined));
  const allIndexed = geoms.every((g) => g.index !== null);
  const temp: BufferGeometry[] = [];
  const list = geoms.map((g) => {
    let src = g;
    if (!allIndexed && g.index !== null) {
      src = g.toNonIndexed();
      temp.push(src);
    }
    const out = new BufferGeometry();
    for (const n of names) out.setAttribute(n, src.attributes[n]!);
    if (allIndexed && src.index) out.setIndex(src.index);
    temp.push(out);
    return out;
  });
  return { list, temp };
}

/** Fusiona geometrias en una; devuelve [geom] (nueva) o null si no se pudo. Una sola pieza se reutiliza. */
function mergePieces(geoms: BufferGeometry[], owned: BufferGeometry[]): BufferGeometry | null {
  if (geoms.length === 1) return geoms[0]!;
  const { list, temp } = unify(geoms);
  const merged = mergeGeometries(list, false);
  for (const t of temp) t.dispose();
  if (!merged) return null;
  owned.push(merged);
  return merged;
}

/** Geometria nueva (comparte posicion, normal e indice) con el color del material como color de vertice. */
export function withVertexColor(g: BufferGeometry, color: Color): BufferGeometry {
  const out = new BufferGeometry();
  const pos = g.getAttribute("position");
  out.setAttribute("position", pos);
  const nrm = g.getAttribute("normal");
  if (nrm) out.setAttribute("normal", nrm);
  if (g.index) out.setIndex(g.index);
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  out.setAttribute("color", new Float32BufferAttribute(c, 3));
  return out;
}

function readMaterial(m: Mesh): Material {
  return Array.isArray(m.material) ? m.material[0]! : m.material;
}

const RECEIVE = new Set(["WHITE_PANEL", "SLAB", "ROOF", "TILE", "MATTE"]);

/**
 * @param scene escena del GLB cargado (no se modifica ni se descarta su geometria: pertenece a la cache de useGLTF).
 */
export function buildGlbModel(scene: Object3D, opts: GlbBuildOptions): GlbModel {
  scene.updateMatrixWorld(true);
  const mats = new GlbMaterials(opts.clip);
  const owned: BufferGeometry[] = [];

  /* 1. Recoger piezas, volumenes y anclas. */
  const pieces: Piece[] = [];
  const spaceSrc = new Map<string, { mesh: Mesh; level: number }>();
  const anchors = new Map<string, Vector3>();
  let sourceMeshes = 0;
  scene.traverse((o) => {
    const own = classifyNode(o.name);
    if (own.kind === "anchor") {
      anchors.set(own.meshId, o.getWorldPosition(new Vector3()));
      return;
    }
    if (!(o as Mesh).isMesh) return;
    const mesh = o as Mesh;
    sourceMeshes++;
    let c = own;
    let level: number | null = typeof mesh.userData["level"] === "number" ? (mesh.userData["level"] as number) : null;
    for (let p: Object3D | null = mesh.parent; p && (c.kind === "other" || c.kind === "floorPart"); p = p.parent) {
      const pc = classifyNode(p.name);
      if (pc.kind === "floor" || pc.kind === "shared") c = pc;
    }
    if (own.kind === "space") {
      const m = /^SPC_(\d{1,2})_/.exec(own.meshId);
      spaceSrc.set(own.meshId, { mesh, level: level ?? (m?.[1] ? Number.parseInt(m[1], 10) : 0) });
      return;
    }
    if (c.kind === "floor" || c.kind === "floorPart") level = c.level;
    const material = readMaterial(mesh);
    const code = mesh.userData["space_code"];
    const matName = mergeClassOf(material.name);
    let geom = bake(mesh);
    if (matName !== material.name) {
      geom = withVertexColor(geom, (material as MeshStandardMaterial).color);
      owned.push(geom);
    }
    const bandLevel = mesh.userData["band_level"];
    pieces.push({
      geom,
      material,
      matName,
      level,
      shared: c.kind === "shared" ? c.group : null,
      band: typeof bandLevel === "number" ? bandLevel : null,
      windowOf:
        material.name === "WINDOW_NIGHT" && typeof code === "string" && level !== null ? windowSpaceMeshId(level, code) : null,
    });
  });
  for (const p of pieces) {
    if (MERGE_CLASS[p.material.name]) mats.getClass(p.matName);
    else mats.get(p.material);
  }

  const topLevel = Math.max(...opts.bands.map((b) => b.level));
  const mk = (geom: BufferGeometry, mat: Material, name: string, ud: Record<string, unknown>, matName: string): Mesh => {
    const m = new Mesh(geom, mat);
    m.name = name;
    m.userData = { ...ud, material: matName };
    m.raycast = guardedRaycast;
    m.castShadow = opts.shadows && !GLB_NO_SHADOW.has(matName);
    m.receiveShadow = opts.shadows && RECEIVE.has(matName);
    if (matName.startsWith("GLASS") || matName === "WINDOW_NIGHT") m.renderOrder = 1;
    return m;
  };
  const byIdx = (items: Piece[]): MergeItem[] => items.map((p, i) => ({ id: String(i), group: "", material: p.matName }));

  /** Fusiona piezas por material (cubetas de planMerge) y crea una malla por cubeta. */
  const mergeInto = (
    list: Piece[],
    group: string,
    matFor: (name: string, src: Material) => Material,
    ud: Record<string, unknown>,
  ): Mesh[] => {
    const out: Mesh[] = [];
    const items = byIdx(list).map((it) => ({ ...it, group }));
    for (const b of planMerge(items)) {
      const sel = b.ids.map((i) => list[Number(i)]!);
      const merged = mergePieces(sel.map((p) => p.geom), owned);
      const src = sel[0]!.material;
      if (merged) out.push(mk(merged, matFor(b.material, src), `${group}_${b.material}`, ud, b.material));
      else {
        // Atributos incompatibles: se conservan las mallas sin fusionar.
        sel.forEach((p, k) => out.push(mk(p.geom, matFor(b.material, src), `${group}_${b.material}_${k}`, ud, b.material)));
      }
    }
    return out;
  };
  const mainMat = (name: string): Material => mats.main.get(name)!;

  /* 2. WHOLE: todo menos las ventanas por espacio (esas viven en su piso). */
  const structural = pieces.filter((p) => p.windowOf === null);
  const whole = new Group();
  whole.name = "WHOLE_BUILDING";
  const wholeMeshes = mergeInto(structural, "WHOLE", (n) => mainMat(n), { part: "whole" });
  for (const m of wholeMeshes) whole.add(m);

  /* 3. Pisos. */
  const floors = new Map<number, GlbFloor>();
  // Solo lo compartido SIN cortar por franja se recorta con clipping planes (GLB antiguos); lo cortado en Blender
  // (band_level) se dibuja con su piso como estructura propia.
  const sliceSource = structural.filter((p) => p.shared !== null && SLICED_GROUPS.includes(p.shared) && p.band === null);
  // La geometria de las rebanadas se fusiona una sola vez por material y se comparte entre pisos.
  const sliceItems = byIdx(sliceSource).map((it) => ({ ...it, group: "SLICE" }));
  const sliceBuckets = planMerge(sliceItems).map((b) => {
    const sel = b.ids.map((i) => sliceSource[Number(i)]!);
    return { material: b.material, pieces: sel, geom: mergePieces(sel.map((p) => p.geom), owned) };
  });

  for (const band of opts.bands) {
    const group = new Group();
    group.name = floorNodeName(band.level);
    group.userData = { level: band.level };
    const range = sliceRange(opts.bands, band.level) ?? { lo: -1000, hi: 1000 };
    const lo = new Plane(new Vector3(0, 1, 0), -range.lo);
    const hi = new Plane(new Vector3(0, -1, 0), range.hi);
    const ud = { part: "struct", level: band.level };

    const own = structural.filter(
      (p) => (p.level === band.level && p.shared === null) || (p.shared !== null && p.shared !== "ROOF" && p.band === band.level),
    );
    const parts: Mesh[] = mergeInto(own, group.name, (n) => mainMat(n), ud);
    if (band.level === topLevel) {
      parts.push(...mergeInto(structural.filter((p) => p.shared === "ROOF"), `${group.name}_ROOF`, (n) => mainMat(n), { ...ud, part: "roof" }));
    }
    for (const sb of sliceBuckets) {
      const mat = mats.slice(sb.material, lo, hi);
      const sUd = { part: "slice", level: band.level };
      if (sb.geom) parts.push(mk(sb.geom, mat, `${group.name}_SLICE_${sb.material}`, sUd, sb.material));
      else sb.pieces.forEach((p, k) => parts.push(mk(p.geom, mat, `${group.name}_SLICE_${sb.material}_${k}`, sUd, sb.material)));
    }
    for (const m of parts) {
      m.visible = false;
      m.userData["swapHidden"] = true;
      group.add(m);
    }

    const windows: Mesh[] = [];
    for (const p of pieces.filter((x) => x.windowOf !== null && x.level === band.level)) {
      const id = p.windowOf!;
      const w = mk(p.geom, mats.windowFor(id, p.material), `${group.name}_WINDOW_${id}`, { part: "window", level: band.level, spaceMeshId: id }, "WINDOW_NIGHT");
      windows.push(w);
      group.add(w);
    }
    floors.set(band.level, { level: band.level, index: band.index, baseY: band.baseY, height: band.height, group, parts, windows, lo, hi, range });
  }

  /* 4. Volumenes de espacio: hijos de su piso, con la transformacion de edificio (en reposo = local). */
  const spaces = new Map<string, Mesh>();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  for (const [meshId, { mesh, level }] of spaceSrc) {
    const fl = floors.get(level);
    if (!fl) continue;
    const v = new Mesh(mesh.geometry, readMaterial(mesh));
    v.name = meshId;
    mesh.matrixWorld.decompose(pos, quat, scl);
    v.position.copy(pos);
    v.quaternion.copy(quat);
    v.scale.copy(scl);
    v.userData = { spaceMeshId: meshId, level };
    fl.group.add(v);
    spaces.set(meshId, v);
  }

  /* 5. Cajas y utilidades. */
  const bounds = new Box3().setFromObject(whole);
  for (const fl of floors.values()) {
    fl.group.updateMatrixWorld(true);
    bounds.expandByObject(fl.group);
  }

  const dispose = (): void => {
    for (const g of owned) g.dispose();
    mats.dispose();
  };
  return {
    whole,
    floors,
    spaces,
    anchors,
    bands: [...opts.bands],
    bounds,
    mats,
    stats: {
      sourceMeshes,
      wholeMeshes: wholeMeshes.length,
      floorMeshes: [...floors.values()].reduce((n, f) => n + f.parts.length, 0),
      windowMeshes: [...floors.values()].reduce((n, f) => n + f.windows.length, 0),
    },
    dispose,
  };
}

/* ------------------------------------------------------------ contexto */

interface CtxEntry {
  mat: MeshStandardMaterial;
  day: Color;
  night: Color;
  lamp: boolean;
}

export interface ContextModel {
  group: Group;
  update: (night: number) => void;
  /** Con un piso aislado solo quedan suelo, vereda y calle: los edificios vecinos distraen del piso. */
  setFocus: (floorIsolated: boolean) => void;
  dispose: () => void;
}

const NIGHT_MUL = new Color(0.22, 0.26, 0.4);

/** Contexto urbano (utp-context.glb). En perfil bajo solo suelo, vereda y calle. */
export function buildContextModel(scene: Object3D, profile: "high" | "low", shadows: boolean): ContextModel {
  scene.updateMatrixWorld(true);
  const group = new Group();
  group.name = "CONTEXT";
  const entries = new Map<string, CtxEntry>();
  const meshes: Mesh[] = [];
  scene.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const src = o as Mesh;
    const sm = readMaterial(src) as MeshStandardMaterial;
    if (!contextMaterialAllowed(profile, sm.name)) return;
    let e = entries.get(sm.name);
    if (!e) {
      const night = sm.color.clone();
      let day = sm.color.clone();
      if (sm.name === "GROUND") {
        day = new Color(DAY_COLORS.ground);
        night.set(NIGHT_COLORS.ground);
      } else if (sm.name === "SIDEWALK") {
        day = new Color(DAY_COLORS.sidewalk);
      } else if (sm.name === "ASPHALT") {
        day = new Color(DAY_COLORS.asphalt);
      } else if (sm.name !== "LAMP_HEAD") {
        night.multiply(NIGHT_MUL);
      }
      const lamp = sm.name === "LAMP_HEAD";
      const mat = new MeshStandardMaterial({
        color: day.clone(),
        roughness: sm.roughness,
        metalness: sm.metalness,
        side: sm.side,
        ...(lamp ? { emissive: sm.emissive.clone(), emissiveIntensity: 0.1 } : {}),
      });
      mat.name = sm.name;
      e = { mat, day, night, lamp };
      entries.set(sm.name, e);
    }
    const m = new Mesh(src.geometry, e.mat);
    m.name = src.name;
    src.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.raycast = () => {};
    m.receiveShadow = shadows && (sm.name === "GROUND" || sm.name === "SIDEWALK" || sm.name === "ASPHALT");
    meshes.push(m);
    group.add(m);
  });
  return {
    group,
    setFocus: (floorIsolated) => {
      for (const m of meshes) m.visible = !floorIsolated || contextMaterialAllowed("low", (m.material as Material).name);
    },
    update: (night) => {
      for (const e of entries.values()) {
        e.mat.color.lerpColors(e.day, e.night, night);
        if (e.lamp) e.mat.emissiveIntensity = MathUtils.lerp(0.1, 1.6, night);
      }
    },
    dispose: () => {
      for (const e of entries.values()) e.mat.dispose();
    },
  };
}
