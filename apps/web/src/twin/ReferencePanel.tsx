import { useRef, useState, type CSSProperties } from "react";
import {
  opacityToPercent,
  percentToOpacity,
  photoLayerOpacity,
  type CompareMode,
  type CompareState,
  type GuideMode,
  type Silhouette,
} from "./compare";
import { PALETTE, REFERENCE_PRIVACY } from "./constants";

/** Panel "Comparar con fotografia" y superposicion del encuadre de referencia (1:1). */

const MODES: Array<{ id: CompareMode; label: string }> = [
  { id: "render", label: "Render" },
  { id: "photo", label: "Foto" },
  { id: "overlay", label: "Superposición" },
];
const GUIDES: Array<{ id: GuideMode; label: string }> = [
  { id: "none", label: "Sin guías" },
  { id: "silhouette", label: "Silueta" },
  { id: "thirds", label: "Tercios" },
];

const btn = (active: boolean, disabled = false): CSSProperties => ({
  minHeight: 34,
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${active ? PALETTE.cyan : PALETTE.border}`,
  background: active ? PALETTE.cyan : "rgba(8,15,29,.7)",
  color: active ? PALETTE.bg : PALETTE.text,
  font: '600 12px/1.3 "IBM Plex Sans", system-ui, sans-serif',
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

export function ReferencePanel({
  state,
  error,
  narrow,
  onFile,
  onMode,
  onOpacity,
  onGuides,
  onClear,
  onExit,
}: {
  state: CompareState;
  error: string | null;
  narrow: boolean;
  onFile: (file: File) => void;
  onMode: (m: CompareMode) => void;
  onOpacity: (opacity: number) => void;
  onGuides: (g: GuideMode) => void;
  onClear: () => void;
  onExit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(true);
  const hasPhoto = state.photoUrl !== null;
  const pct = opacityToPercent(state.opacity);
  return (
    <section
      aria-label="Comparar con fotografía"
      style={{
        position: "absolute",
        left: 8,
        bottom: 34,
        width: narrow ? "calc(100% - 16px)" : 272,
        maxHeight: "calc(100% - 96px)",
        overflow: "auto",
        padding: 10,
        borderRadius: 10,
        background: "rgba(23,36,58,.94)",
        border: `1px solid ${PALETTE.border}`,
        color: PALETTE.text,
        font: '500 12px/1.4 "IBM Plex Sans", system-ui, sans-serif',
        boxShadow: "0 8px 24px rgba(0,0,0,.5)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, flex: 1 }}>Comparar con fotografía</h3>
        <button type="button" style={btn(false)} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {open ? (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              ref={input}
              type="file"
              accept="image/*"
              tabIndex={-1}
              aria-label="Elegir una fotografía de tu dispositivo"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f) onFile(f);
              }}
            />
            <button type="button" style={btn(false)} onClick={() => input.current?.click()}>
              {hasPhoto ? "Cambiar foto" : "Cargar foto"}
            </button>
            {hasPhoto ? (
              <button type="button" style={btn(false)} onClick={onClear}>
                Quitar foto
              </button>
            ) : null}
            <button type="button" style={btn(false)} onClick={onExit}>
              Salir
            </button>
          </div>
          {error ? (
            <p role="alert" style={{ margin: 0, color: PALETTE.critical }}>
              {error}
            </p>
          ) : null}

          <div role="group" aria-label="Qué mostrar" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={state.mode === m.id}
                disabled={!hasPhoto && m.id !== "render"}
                style={btn(state.mode === m.id, !hasPhoto && m.id !== "render")}
                onClick={() => onMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label style={{ display: "grid", gap: 2 }}>
            <span>
              Opacidad de la foto: <strong>{pct} %</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              disabled={!hasPhoto}
              onChange={(e) => onOpacity(percentToOpacity(Number(e.currentTarget.value)))}
              style={{ width: "100%", minHeight: 28, accentColor: PALETTE.cyan }}
            />
          </label>

          <div role="group" aria-label="Guías de alineación" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {GUIDES.map((g) => (
              <button key={g.id} type="button" aria-pressed={state.guides === g.id} style={btn(state.guides === g.id)} onClick={() => onGuides(g.id)}>
                {g.label}
              </button>
            ))}
          </div>

          <p style={{ margin: 0, fontSize: 11, color: "#B8C4D8" }}>{REFERENCE_PRIVACY}</p>
        </>
      ) : null}
    </section>
  );
}

/** Foto y guias sobre el cuadro 1:1 (no captura punteros: la orbita sigue funcionando). */
export function ReferenceOverlay({
  state,
  rect,
  silhouette,
  onPhotoError,
}: {
  state: CompareState;
  rect: { x: number; y: number; size: number };
  silhouette: Silhouette;
  onPhotoError: () => void;
}) {
  const opacity = photoLayerOpacity(state);
  const pts = (list: Array<[number, number]>) => list.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(" ");
  const line = { stroke: PALETTE.gold, strokeWidth: 0.35, vectorEffect: "non-scaling-stroke" as const };
  return (
    <div
      aria-hidden={state.photoUrl === null && state.guides === "none"}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.size,
        height: rect.size,
        pointerEvents: "none",
        boxSizing: "border-box",
        border: `1px solid ${PALETTE.cyan}66`,
        overflow: "hidden",
      }}
    >
      {state.photoUrl ? (
        <img
          src={state.photoUrl}
          alt="Fotografía de referencia cargada por el usuario (solo local)"
          onError={onPhotoError}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity }}
        />
      ) : null}
      {state.guides !== "none" ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          {state.guides === "thirds" ? (
            <>
              <line x1="33.333" y1="0" x2="33.333" y2="100" {...line} />
              <line x1="66.667" y1="0" x2="66.667" y2="100" {...line} />
              <line x1="0" y1="33.333" x2="100" y2="33.333" {...line} />
              <line x1="0" y1="66.667" x2="100" y2="66.667" {...line} />
            </>
          ) : (
            <>
              <polygon points={pts(silhouette.hull)} fill="none" strokeDasharray="2 1.2" {...line} />
              {silhouette.nearEdge ? (
                <line x1={silhouette.nearEdge[0][0] * 100} y1={silhouette.nearEdge[0][1] * 100} x2={silhouette.nearEdge[1][0] * 100} y2={silhouette.nearEdge[1][1] * 100} {...line} />
              ) : null}
              <line x1="50" y1="0" x2="50" y2="100" stroke={PALETTE.cyan} strokeWidth={0.2} vectorEffect="non-scaling-stroke" strokeOpacity={0.5} />
            </>
          )}
        </svg>
      ) : null}
    </div>
  );
}
