import type { CampusResponse } from "@campuspulse/contracts";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { PALETTE } from "../twin/constants";
import { scaleForWidth } from "./logic";
import { applySpaceColors, loadCampusModel } from "./model";
import { INITIAL_PLACEMENT, onFrame as placementFrame, onReset as placementReset, onTap as placementTap, type PlacementState } from "./placement";

/*
 * Sesion WebXR (nivel A) con la API de three (renderer.xr) y la del navegador.
 * No usa @react-three/xr. Solo se ejecuta en navegadores con WebXR immersive-ar
 * (Chrome Android + ARCore). La colocacion ocurre en un fotograma de ANIMACION (ver placement.ts): el XRFrame
 * de un evento "select" no trae resultados de hit-test. Verificacion en el S25 Ultra: pendiente tras esta correccion.
 */

export interface XrCallbacks {
  /** La sesion termino (por el usuario, por el sistema o por error). */
  onEnd: () => void;
  /** Cambio de estado legible para aria-live. */
  onStatus: (message: string) => void;
  /** El modelo se coloco (true) o se reinicio la colocacion (false). */
  onPlaced: (placed: boolean, anchored: boolean) => void;
  /** Espacio tocado (space_id) o null al tocar fuera. */
  onSelect: (spaceId: string | null) => void;
}

export interface XrStartOptions {
  campus: CampusResponse;
  overlay: HTMLElement;
  widthM: number;
  colors: ReadonlyMap<string, string>;
  callbacks: XrCallbacks;
}

export interface XrHandle {
  end: () => Promise<void>;
  setWidth: (widthM: number) => void;
  setColors: (colors: ReadonlyMap<string, string>) => void;
  setSelected: (spaceId: string | null) => void;
  resetPlacement: () => void;
}

const TMP_M = new Matrix4();
const TMP_V = new Vector3();
const TMP_V2 = new Vector3();
const TMP_Q = new Quaternion();

/**
 * Debe llamarse directamente desde el manejador de un gesto del usuario (un click),
 * antes de cualquier await, porque requestSession exige activacion transitoria.
 */
export function startArSession(opts: XrStartOptions): Promise<XrHandle> {
  const xr = navigator.xr;
  if (!xr) return Promise.reject(new Error("navigator.xr no disponible"));
  const { campus, overlay, callbacks } = opts;

  const request = xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "local-floor", "anchors"],
    domOverlay: { root: overlay },
  });

  return request.then(async (session) => {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.xr.enabled = true;
    // 'local' siempre esta concedido en AR; 'local-floor' es opcional y no se necesita con hit-test.
    renderer.xr.setReferenceSpaceType("local");

    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(new HemisphereLight("#dbe7ff", "#2a3550", 1.1));
    scene.add(new AmbientLight("#ffffff", 0.35));
    const sun = new DirectionalLight("#fff4e0", 1.6);
    sun.position.set(0.6, 1.4, 0.8);
    scene.add(sun);

    // Jerarquia: holder (ancla / pose) -> yaw (orientacion hacia el usuario) -> model (escala).
    const { model, source: modelSource } = await loadCampusModel(campus);
    const holder = new Group();
    holder.matrixAutoUpdate = false;
    holder.visible = false;
    const yaw = new Group();
    holder.add(yaw);
    yaw.add(model.group);
    scene.add(holder);
    applySpaceColors(model, opts.colors);

    const applyWidth = (w: number): void => {
      model.group.scale.setScalar(scaleForWidth(w, model.widthM));
    };
    applyWidth(opts.widthM);

    const reticleGeo = new RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
    const reticleMat = new MeshBasicMaterial({ color: new Color(PALETTE.cyan) });
    const reticle = new Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const outlineGeo = new EdgesGeometry(new BoxGeometry(1, 1, 1));
    const outlineMat = new LineBasicMaterial({ color: new Color(PALETTE.gold) });
    const outline = new LineSegments(outlineGeo, outlineMat);
    outline.visible = false;
    model.group.add(outline);
    let selectedMesh: Mesh | null = null;

    const setSelected = (spaceId: string | null) => {
      if (selectedMesh) (selectedMesh.material as MeshStandardMaterial).emissiveIntensity = 0.25;
      selectedMesh = null;
      outline.visible = false;
      if (!spaceId) return;
      for (const m of model.spaceMeshes.values()) {
        if (m.userData["spaceId"] !== spaceId) continue;
        selectedMesh = m;
        (m.material as MeshStandardMaterial).emissiveIntensity = 0.85;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        const sz = bb ? bb.getSize(TMP_V2) : TMP_V2.set(1, 1, 1);
        outline.position.copy(m.position);
        outline.scale.set(sz.x * 1.03, sz.y * 1.03, sz.z * 1.03);
        outline.visible = true;
      }
    };

    let hitTestSource: XRHitTestSource | null = null;
    let anchor: XRAnchor | null = null;
    let placed = false;
    let ended = false;
    let pstate: PlacementState = INITIAL_PLACEMENT;
    const raycaster = new Raycaster();

    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);

    // Sin DOM overlay no hay botones ni panel: se cierra con un mensaje claro.
    if (!session.domOverlayState) {
      callbacks.onStatus("Este navegador no ofrece DOM overlay: no se puede mostrar el panel de control. Se cerró la sesión.");
      void session.end();
    } else {
      callbacks.onStatus(
        `AR iniciada con ${modelSource === "glb" ? "el modelo de Blender" : "la geometría procedural (el GLB no cargó)"}. Buscando superficie… mueve el teléfono despacio sobre una mesa con textura hasta ver el aro cian.`,
      );
    }

    session
      .requestReferenceSpace("viewer")
      .then((vs) => session.requestHitTestSource?.({ space: vs }))
      .then((src) => {
        if (!src) return;
        if (ended) src.cancel();
        else hitTestSource = src;
      })
      .catch((e: unknown) => callbacks.onStatus(`No se pudo iniciar el hit-test: ${e instanceof Error ? e.message : String(e)}`));

    /** Coloca con el hit-test de un fotograma de ANIMACION (unico momento en que hay resultados y anclas validas). */
    const place = (frame: XRFrame, refSpace: XRReferenceSpace, hit: XRHitTestResult, pose: XRPose): void => {
      holder.matrix.fromArray(pose.transform.matrix);
      holder.matrixWorldNeedsUpdate = true;
      // Orienta la fachada principal (+Z) hacia el usuario en el momento de colocar.
      const viewer = frame.getViewerPose(refSpace);
      if (viewer) {
        const p = viewer.transform.position;
        TMP_V.set(p.x, p.y, p.z).applyMatrix4(TMP_M.copy(holder.matrix).invert());
        yaw.rotation.y = Math.atan2(TMP_V.x, TMP_V.z);
      }
      holder.visible = true;
      reticle.visible = false;
      placed = true;
      if (typeof hit.createAnchor === "function") {
        hit.createAnchor().then(
          (a) => {
            if (ended || !placed) {
              a.delete();
              return;
            }
            anchor?.delete();
            anchor = a;
            callbacks.onPlaced(true, true);
          },
          () => callbacks.onPlaced(true, false),
        );
      }
      callbacks.onPlaced(true, false);
    };

    const pick = (frame: XRFrame, refSpace: XRReferenceSpace, source: XRInputSource): void => {
      const pose = frame.getPose(source.targetRaySpace, refSpace);
      if (!pose) return;
      const t = pose.transform;
      raycaster.ray.origin.set(t.position.x, t.position.y, t.position.z);
      raycaster.ray.direction
        .set(0, 0, -1)
        .applyQuaternion(TMP_Q.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w))
        .normalize();
      holder.updateMatrixWorld(true);
      const hit = raycaster.intersectObjects([...model.spaceMeshes.values()], false)[0];
      const id = hit ? (hit.object.userData["spaceId"] as string | undefined) ?? null : null;
      setSelected(id);
      callbacks.onSelect(id);
    };

    const onSelect = (ev: XRInputSourceEvent): void => {
      const refSpace = renderer.xr.getReferenceSpace();
      if (!refSpace) return;
      if (!placed) {
        const t = placementTap(pstate, performance.now());
        pstate = t.state;
        if (t.status) callbacks.onStatus(t.status);
      } else pick(ev.frame, refSpace, ev.inputSource);
    };
    session.addEventListener("select", onSelect);

    const onFrame = (_time: number, frame?: XRFrame): void => {
      if (frame) {
        const refSpace = renderer.xr.getReferenceSpace();
        if (refSpace) {
          if (!placed && hitTestSource) {
            const hit = frame.getHitTestResults(hitTestSource)[0];
            const pose = hit?.getPose(refSpace);
            const step = placementFrame(pstate, Boolean(hit && pose), performance.now());
            pstate = step.state;
            reticle.visible = step.showReticle;
            if (pose) reticle.matrix.fromArray(pose.transform.matrix);
            if (step.place && hit && pose) place(frame, refSpace, hit, pose);
            if (step.status) callbacks.onStatus(step.status);
          }
          if (placed && anchor) {
            const pose = frame.getPose(anchor.anchorSpace, refSpace);
            holder.visible = Boolean(pose);
            if (pose) {
              holder.matrix.fromArray(pose.transform.matrix);
              holder.matrixWorldNeedsUpdate = true;
            }
          }
        }
      }
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(onFrame);

    const resetPlacement = () => {
      placed = false;
      const rs = placementReset();
      pstate = rs.state;
      holder.visible = false;
      anchor?.delete();
      anchor = null;
      setSelected(null);
      callbacks.onSelect(null);
      callbacks.onPlaced(false, false);
      callbacks.onStatus(rs.status);
    };

    const cleanup = () => {
      if (ended) return;
      ended = true;
      renderer.setAnimationLoop(null);
      session.removeEventListener("select", onSelect);
      hitTestSource?.cancel();
      hitTestSource = null;
      anchor?.delete();
      anchor = null;
      model.dispose();
      outlineGeo.dispose();
      outlineMat.dispose();
      reticleGeo.dispose();
      reticleMat.dispose();
      scene.clear();
      renderer.dispose();
      callbacks.onEnd();
    };
    session.addEventListener("end", cleanup);

    const handle: XrHandle = {
      end: async () => {
        if (ended) return;
        try {
          await session.end();
        } catch {
          cleanup();
        }
      },
      setWidth: applyWidth,
      setColors: (colors) => applySpaceColors(model, colors),
      setSelected,
      resetPlacement,
    };
    return handle;
  });
}
