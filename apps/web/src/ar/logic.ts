import type { CampusResponse, LiveSnapshot, LiveSpace, Space } from "@campuspulse/contracts";
import { STATUS_LABEL, colorForSpace } from "../twin/colors";
import type { TwinLayer } from "../twin/types";

/*
 * Logica PURA de la pagina AR (sin WebGL ni React): deteccion de capacidades,
 * intent de Scene Viewer y mapeo de datos a colores/etiquetas.
 */

/** Modelo real de Blender (LOD movil) para Scene Viewer (nivel B) y WebXR (nivel A). */
export const GLB_PATH = "/models/utp-huancayo-mobile.glb";
export const SCENE_VIEWER_TITLE = "CampusPulse 360";

/* ------------------------------------------------------------ capacidades */

/** Subconjunto de navigator.xr que necesitamos (facil de simular en pruebas). */
export interface XrSystemLike {
  isSessionSupported: (mode: "immersive-ar") => Promise<boolean>;
}

export interface CapabilityEnv {
  isSecureContext: boolean;
  protocol: string;
  hostname: string;
  userAgent: string;
  xr?: XrSystemLike | null | undefined;
}

export interface Capabilities {
  /** window.isSecureContext (HTTPS o localhost). */
  secure: boolean;
  /** Protocolo https: (localhost por http NO cuenta). */
  https: boolean;
  localhost: boolean;
  /** Existe navigator.xr. */
  hasWebXr: boolean;
  /** isSessionSupported('immersive-ar') devolvio true. */
  immersiveAr: boolean;
  android: boolean;
  /** Android o iOS/iPadOS: dispositivo tactil movil. */
  mobile: boolean;
  /** Error al consultar WebXR, si lo hubo. */
  probeError: string | null;
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}

export async function probeCapabilities(env: CapabilityEnv): Promise<Capabilities> {
  const android = isAndroid(env.userAgent);
  const mobile = android || /iPhone|iPad|iPod/i.test(env.userAgent);
  const base: Capabilities = {
    secure: env.isSecureContext,
    https: env.protocol === "https:",
    localhost: isLocalHost(env.hostname),
    hasWebXr: Boolean(env.xr),
    immersiveAr: false,
    android,
    mobile,
    probeError: null,
  };
  if (!env.isSecureContext || !env.xr) return base;
  try {
    return { ...base, immersiveAr: (await env.xr.isSessionSupported("immersive-ar")) === true };
  } catch (e) {
    return { ...base, probeError: e instanceof Error ? e.message : String(e) };
  }
}

export type LevelId = "A" | "B" | "C";

export interface LevelStatus {
  available: boolean;
  /** Motivo en lenguaje claro cuando no esta disponible. */
  reason: string | null;
}

/** Disponibilidad de cada nivel. C (vista 3D orbital) siempre esta disponible. */
export function evaluateLevels(caps: Capabilities, glbAvailable: boolean | null): Record<LevelId, LevelStatus> {
  let a: string | null = null;
  if (!caps.secure) {
    a = "AR en vivo necesita un contexto seguro: esta página se sirve por HTTP sin TLS. Usa HTTPS (o localhost mediante adb reverse).";
  } else if (!caps.hasWebXr) {
    a = "Este navegador no ofrece WebXR. Usa Chrome en un teléfono o tableta Android compatible con ARCore.";
  } else if (caps.probeError) {
    a = `No se pudo consultar WebXR (${caps.probeError}).`;
  } else if (!caps.immersiveAr) {
    a = caps.mobile
      ? "Este dispositivo o navegador no admite sesiones de AR inmersiva (requiere ARCore / Servicios de Google Play para AR)."
      : "Este equipo no admite AR inmersiva (típico de escritorio). Abre esta página en un teléfono o tableta Android.";
  }

  let b: string | null = null;
  if (!caps.android) {
    b = "Scene Viewer de ARCore solo existe en Android.";
  } else if (!caps.https || caps.localhost) {
    b = "Scene Viewer necesita una URL https pública hacia el modelo; no funciona desde HTTP ni desde localhost.";
  } else if (glbAvailable === false) {
    b = "El modelo estático (utp-huancayo-mobile.glb) no está publicado en este despliegue; el nivel B queda desactivado.";
  } else if (glbAvailable === null) {
    b = "Comprobando que el modelo estático esté publicado…";
  }

  return {
    A: { available: a === null, reason: a },
    B: { available: b === null, reason: b },
    C: { available: true, reason: null },
  };
}

/* ------------------------------------------------------------ Scene Viewer */

export function glbUrl(origin: string): string {
  return new URL(GLB_PATH, origin).toString();
}

/**
 * Intent de Android para Scene Viewer (ARCore). `file` debe ser una URL https
 * absoluta; si lleva parametros se codifica entera. `browser_fallback_url` se
 * codifica siempre (contiene ':' y '/', y el intent usa ';' como separador).
 */
export function buildSceneViewerIntent(opts: { glbUrl: string; fallbackUrl: string; title?: string }): string {
  const file = /[?&#]/.test(opts.glbUrl) ? encodeURIComponent(opts.glbUrl) : opts.glbUrl;
  const title = encodeURIComponent(opts.title ?? SCENE_VIEWER_TITLE);
  return (
    `intent://arvr.google.com/scene-viewer/1.2?file=${file}&mode=ar_preferred&title=${title}` +
    `#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;` +
    `S.browser_fallback_url=${encodeURIComponent(opts.fallbackUrl)};end;`
  );
}

/* ------------------------------------------------------------ escala de maqueta */

export const DEFAULT_MODEL_WIDTH_M = 0.6;
export const MIN_MODEL_WIDTH_M = 0.2;
export const MAX_MODEL_WIDTH_M = 2;
const STEP_FACTOR = 1.25;

export function clampWidth(w: number): number {
  const v = Number.isFinite(w) ? w : DEFAULT_MODEL_WIDTH_M;
  return Math.round(Math.min(MAX_MODEL_WIDTH_M, Math.max(MIN_MODEL_WIDTH_M, v)) * 1000) / 1000;
}

/** dir = +1 agranda, -1 reduce (paso geometrico de 25 %). */
export function stepWidth(w: number, dir: 1 | -1): number {
  return clampWidth(dir > 0 ? w * STEP_FACTOR : w / STEP_FACTOR);
}

/** Factor de escala para que un edificio de `buildingWidthM` mida `targetWidthM`. */
export function scaleForWidth(targetWidthM: number, buildingWidthM: number): number {
  return buildingWidthM > 0 ? clampWidth(targetWidthM) / buildingWidthM : 1;
}

/* ------------------------------------------------------------ datos -> modelo */

/** mesh_id -> color hex segun los datos vivos (gris "offline" si no hay dato). */
export function spaceColorMap(
  campus: CampusResponse,
  live: LiveSnapshot | null,
  layer: TwinLayer = "status",
): Map<string, string> {
  const bySpace = new Map<string, LiveSpace>((live?.spaces ?? []).map((s) => [s.space_id, s]));
  const out = new Map<string, string>();
  for (const s of campus.spaces) out.set(s.mesh_id, colorForSpace(layer, bySpace.get(s.id), s.capacity));
  return out;
}

export interface SpaceOverlayInfo {
  name: string;
  status: string;
  co2: string;
  occupancy: string;
  /** "sim" u otro origen reportado por la API, o null. */
  source: string | null;
}

/** Texto del panel DOM overlay al tocar un espacio. */
export function describeSpace(space: Space, live: LiveSpace | null | undefined): SpaceOverlayInfo {
  const m = live && live.status !== "offline" ? live.metrics : null;
  return {
    name: `${space.name} (${space.code})`,
    status: live ? STATUS_LABEL[live.status] : "Sin datos",
    co2: m ? `${Math.round(m.co2_ppm)} ppm` : "Sin dato",
    occupancy: m ? `${m.occupancy} / ${space.capacity} personas` : "Sin dato",
    source: live?.source ?? null,
  };
}
