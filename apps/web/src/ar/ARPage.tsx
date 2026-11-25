import { Box, Minus, Plus, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useCampusCtx, useLiveCtx } from "../app/context";
import { Notice, PageHeader, Panel } from "../components/ui";
import {
  DEFAULT_MODEL_WIDTH_M,
  GLB_PATH,
  MAX_MODEL_WIDTH_M,
  MIN_MODEL_WIDTH_M,
  buildSceneViewerIntent,
  describeSpace,
  evaluateLevels,
  glbUrl,
  probeCapabilities,
  spaceColorMap,
  stepWidth,
  type Capabilities,
  type LevelStatus,
} from "./logic";
import type { XrHandle } from "./xrSession";

const fmtWidth = (w: number) => `${w.toFixed(2).replace(".", ",")} m`;

function Availability({ status, label }: { status: LevelStatus | null; label: string }) {
  if (!status) return <p className="text-sm text-ink-2">Comprobando compatibilidad…</p>;
  return status.available ? (
    <p className="text-sm font-medium text-ok">{label}</p>
  ) : (
    <p className="text-sm text-ink-2">{status.reason}</p>
  );
}

export default function ARPage() {
  const campus = useCampusCtx().data;
  const live = useLiveCtx().data;

  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [glbOk, setGlbOk] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_MODEL_WIDTH_M);
  const [placed, setPlaced] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<XrHandle | null>(null);

  // Deteccion de capacidades (WebXR, contexto seguro, plataforma) y del GLB estatico.
  useEffect(() => {
    let cancelled = false;
    void probeCapabilities({
      isSecureContext: window.isSecureContext,
      protocol: location.protocol,
      hostname: location.hostname,
      userAgent: navigator.userAgent,
      xr: navigator.xr ?? null,
    }).then((c) => !cancelled && setCaps(c));

    const ctrl = new AbortController();
    fetch(GLB_PATH, { method: "HEAD", signal: ctrl.signal })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        // Un SPA devuelve index.html (text/html) para rutas inexistentes: eso no es un GLB.
        if (!cancelled) setGlbOk(r.ok && !type.includes("text/html"));
      })
      .catch(() => !cancelled && setGlbOk(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const levels = useMemo(() => (caps ? evaluateLevels(caps, glbOk) : null), [caps, glbOk]);

  const colors = useMemo(() => (campus ? spaceColorMap(campus, live) : null), [campus, live]);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Datos EN VIVO hacia el modelo mientras dura la sesion.
  useEffect(() => {
    if (colors) handleRef.current?.setColors(colors);
  }, [colors]);

  // Cuerpo con llaves: un efecto NUNCA debe devolver el resultado de una llamada (React lo
  // trataria como limpieza; three devuelve objetos encadenables -> "destroy is not a function").
  useEffect(() => {
    handleRef.current?.setWidth(width);
  }, [width]);

  // Los toques sobre los controles del overlay no deben colocar ni seleccionar en la escena.
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    // Solo los elementos interactivos del panel bloquean el toque; el resto de la pantalla coloca/selecciona.
    const stop = (e: Event) => {
      const t = e.target as Element | null;
      if (t && t !== el && t.closest?.("button, input, select, label, a, [data-xr-ui]")) e.preventDefault();
    };
    el.addEventListener("beforexrselect", stop);
    return () => el.removeEventListener("beforexrselect", stop);
  }, [active]);

  // Libera la sesion si se abandona la pagina.
  useEffect(
    () => () => {
      void handleRef.current?.end();
    },
    [],
  );

  const start = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !campus || starting || active) return;
    setStarting(true);
    setError(null);
    setPlaced(false);
    setSelectedId(null);
    setStatus("Solicitando sesión de AR…");
    // requestSession exige activacion transitoria: la importacion dinamica ya esta precargada
    // al montar (ver efecto de abajo); aqui se llama de forma sincrona dentro del click.
    const mod = xrModule.current;
    if (!mod) {
      setStarting(false);
      setError("El módulo de AR aún se está cargando. Inténtalo de nuevo en un instante.");
      return;
    }
    mod
      .startArSession({
        campus,
        overlay,
        widthM: width,
        colors: colorsRef.current ?? new Map(),
        callbacks: {
          onEnd: () => {
            handleRef.current = null;
            setActive(false);
            setStarting(false);
            setPlaced(false);
            setSelectedId(null);
            setStatus("Sesión de AR finalizada.");
          },
          onStatus: setStatus,
          onPlaced: (p) => setPlaced(p),
          onSelect: setSelectedId,
        },
      })
      .then((h) => {
        handleRef.current = h;
        setActive(true);
        setStarting(false);
      })
      .catch((e: unknown) => {
        setStarting(false);
        setActive(false);
        const msg = e instanceof Error ? e.message : String(e);
        setError(`No se pudo iniciar la AR: ${msg}`);
        setStatus("No se pudo iniciar la AR.");
      });
  }, [campus, starting, active, width]);

  // Precarga el modulo three/XR (chunk diferido) para que start() pueda ser sincrono dentro del gesto.
  const xrModule = useRef<typeof import("./xrSession") | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("./xrSession").then((m) => {
      if (!cancelled) xrModule.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = () => void handleRef.current?.end();
  const bigger = () => setWidth((w) => stepWidth(w, 1));
  const smaller = () => setWidth((w) => stepWidth(w, -1));
  const replace = () => handleRef.current?.resetPlacement();

  const liveById = useMemo(() => new Map((live?.spaces ?? []).map((s) => [s.space_id, s])), [live]);
  const selectedInfo = useMemo(() => {
    const space = selectedId ? campus?.spaces.find((s) => s.id === selectedId) : null;
    return space ? describeSpace(space, liveById.get(space.id)) : null;
  }, [selectedId, campus, liveById]);

  const origin = typeof location !== "undefined" ? location.origin : "";
  const intent = useMemo(
    () =>
      levels?.B.available
        ? buildSceneViewerIntent({ glbUrl: glbUrl(origin), fallbackUrl: location.href })
        : null,
    [levels, origin],
  );

  const canStartA = Boolean(levels?.A.available && campus && !starting && !active);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Realidad aumentada"
        subtitle="Coloca una maqueta del edificio sobre una mesa. Telemetría simulada. Modelo aproximado basado en fotografía · dimensiones estimadas · sin planos verificados."
      />

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      <Panel title="Recomendación para una buena detección" icon={<Smartphone size={16} aria-hidden="true" />}>
        <p className="text-sm text-ink-2">
          Usa una superficie con textura (un póster, un mantel con estampado, una mesa de madera) y buena luz. Las
          superficies lisas, brillantes u oscuras dificultan el seguimiento.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Nivel A · AR en vivo (WebXR)" icon={<Box size={16} aria-hidden="true" />}>
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Maqueta de ≈{fmtWidth(DEFAULT_MODEL_WIDTH_M)} con los colores de estado actualizándose en tiempo real. Toca un
              espacio para ver su CO₂ y ocupación.
            </p>
            <Availability status={levels?.A ?? null} label="Disponible en este dispositivo." />
            {!campus ? <p className="text-sm text-warn">Esperando los datos del campus…</p> : null}
            {error ? <Notice kind="error">{error}</Notice> : null}
            <button type="button" className="btn btn-primary" disabled={!canStartA} onClick={start}>
              {starting ? "Iniciando…" : "Iniciar AR"}
            </button>
          </div>
        </Panel>

        <Panel title="Nivel B · Scene Viewer (estable)">
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Abre el visor de ARCore de Android con un modelo estático.</p>
            <p className="text-sm font-medium text-gold">Instantánea estática, sin datos en vivo.</p>
            <Availability status={levels?.B ?? null} label="Disponible: se abrirá Scene Viewer." />
            {intent ? (
              <a className="btn btn-primary no-underline" href={intent}>
                Abrir en Scene Viewer
              </a>
            ) : (
              <button type="button" className="btn" disabled>
                Abrir en Scene Viewer
              </button>
            )}
          </div>
        </Panel>

        <Panel title="Nivel C · Sin AR">
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Si tu dispositivo no admite AR, usa el gemelo 3D orbital en la pantalla.</p>
            <Link to="/" className="btn no-underline">
              Vista 3D (no es AR)
            </Link>
          </div>
        </Panel>
      </div>

      {/*
        Raiz del DOM overlay de WebXR. Siempre presente (y sin tamano mientras no hay sesion)
        para que requestSession reciba un elemento del documento.
      */}
      <div
        ref={overlayRef}
        data-testid="ar-overlay"
        style={active ? { color: "#E6EDF7", pointerEvents: "none" } : { width: 0, height: 0, overflow: "hidden" }}
      >
        {active ? (
          <div ref={controlsRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div className="flex items-start justify-between gap-2 p-3" style={{ pointerEvents: "none" }}>
              <p
                role="status"
                aria-live="polite"
                data-xr-ui=""
                className="max-w-[70%] rounded-lg border border-line bg-panel/90 px-3 py-2 text-sm"
                style={{ pointerEvents: "auto" }}
              >
                {status}
              </p>
              <button type="button" className="btn btn-primary" style={{ pointerEvents: "auto" }} onClick={exit}>
                <X size={16} aria-hidden="true" /> Salir
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 space-y-2 p-3" style={{ pointerEvents: "none" }}>
              {selectedInfo ? (
                <div
                  className="rounded-xl border border-line bg-panel/95 p-3 text-sm"
                  style={{ pointerEvents: "auto" }}
                  aria-label="Espacio seleccionado"
                  data-xr-ui=""
                >
                  <p className="font-semibold">{selectedInfo.name}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-ink-2">Estado</dt>
                    <dd>{selectedInfo.status}</dd>
                    <dt className="text-ink-2">CO₂</dt>
                    <dd>{selectedInfo.co2}</dd>
                    <dt className="text-ink-2">Ocupación</dt>
                    <dd>{selectedInfo.occupancy}</dd>
                  </dl>
                  <p className="mt-1 text-xs text-gold">Datos simulados, no medidos.</p>
                </div>
              ) : null}

              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/95 p-2"
                style={{ pointerEvents: "auto" }}
              >
                <span className="px-1 text-sm" aria-live="polite">
                  Ancho: {fmtWidth(width)}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={smaller}
                  disabled={width <= MIN_MODEL_WIDTH_M}
                  aria-label="Reducir maqueta"
                >
                  <Minus size={14} aria-hidden="true" /> Reducir
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={bigger}
                  disabled={width >= MAX_MODEL_WIDTH_M}
                  aria-label="Ampliar maqueta"
                >
                  <Plus size={14} aria-hidden="true" /> Ampliar
                </button>
                <button type="button" className="btn btn-sm" onClick={replace} disabled={!placed}>
                  Recolocar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
