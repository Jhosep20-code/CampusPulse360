import { ArrowLeft } from "lucide-react";
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useLiveCtx, useSpaceIndex } from "../app/context";
import { WatchDial, type WatchLevel, type WatchScreen } from "../components/WatchDial";
import { useActiveIncidents } from "../hooks/useActiveIncidents";
import { fmtInt, fmtPct } from "../lib/format";

/** Ancho CSS maximo para tratar la pagina como un reloj real (pantalla completa). */
export const WATCH_MAX_WIDTH = 320;

/** Tamanos de previsualizacion: diametro de la esfera en px CSS. */
const PREVIEW_SIZES = [
  { id: "40", label: "40 mm", px: 198 },
  { id: "44", label: "44/47 mm", px: 225 },
] as const;

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}
const getWidth = () => window.innerWidth;
const getHeight = () => window.innerHeight;
const serverSize = () => 0;

/** Hora HH:MM en 24 h (corta para caber en la esfera). */
const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Alto y ancho de la ventana; se actualiza al girar o redimensionar. */
function useViewport(): { width: number; height: number } {
  const width = useSyncExternalStore(subscribeResize, getWidth, serverSize);
  const height = useSyncExternalStore(subscribeResize, getHeight, serverSize);
  return { width, height };
}

/**
 * Vista de reloj (Galaxy Watch6 Classic, pantalla circular). Con <= 320 px CSS ocupa toda la
 * pantalla; con mas ancho se muestra como "Vista previa del reloj" dentro de un marco simulado.
 * El modo depende solo del ancho, nunca del user-agent. Los datos son simulados.
 */
export default function WatchView() {
  const live = useLiveCtx();
  const spaces = useSpaceIndex();
  const { width, height } = useViewport();
  const [index, setIndex] = useState(0);
  const [previewId, setPreviewId] = useState<string>("44");

  const k = live.data?.kpis;
  const incidents = useActiveIncidents(k?.open_incidents);
  const top = incidents.data?.[0];
  const occ = k && k.capacity_total > 0 ? k.occupancy_total / k.capacity_total : 0;

  const level: WatchLevel = !k
    ? "offline"
    : k.spaces_critical > 0 || top?.severity === "critical"
      ? "critical"
      : k.spaces_warning > 0 || top?.severity === "warning"
        ? "warning"
        : "ok";

  const spaceName = top ? (spaces.get(top.space_id)?.name ?? top.space_id) : null;
  const alertScreen: WatchScreen = top
    ? { id: "alerta", label: "Alerta más grave", value: top.title, ...(spaceName ? { detail: spaceName } : {}), kind: "text" }
    : incidents.loading && !incidents.data
      ? { id: "alerta", label: "Alerta más grave", value: "Cargando…", kind: "text" }
      : incidents.error
        ? { id: "alerta", label: "Alerta más grave", value: "Sin datos de alertas", kind: "text" }
        : { id: "alerta", label: "Alerta más grave", value: "Campus normal", kind: "text" };

  const co2 = k?.avg_co2_ppm;
  const screens: WatchScreen[] = [
    alertScreen,
    {
      id: "co2",
      label: "CO₂ medio",
      value: co2 == null ? "—" : fmtInt(co2),
      unit: "ppm",
      ...(co2 != null && co2 >= 1000 ? { detail: "Sobre 1000 ppm" } : {}),
      kind: "number",
    },
    {
      id: "ocupacion",
      label: "Ocupación",
      value: k ? fmtPct(occ) : "—",
      ...(k ? { detail: `${fmtInt(k.occupancy_total)} de ${fmtInt(k.capacity_total)} pers.` } : {}),
      kind: "number",
    },
  ];

  const updatedLabel = live.lastUpdated ? fmtClock(live.lastUpdated) : "sin datos";
  const fullscreen = width > 0 && width <= WATCH_MAX_WIDTH;

  if (fullscreen) {
    const size = Math.max(160, Math.min(width, height || width));
    return (
      <main className="fixed inset-0 grid place-items-center overflow-hidden bg-[#080F1D]">
        <h1 className="sr-only">Vista de reloj</h1>
        <WatchDial size={size} level={level} screens={screens} index={index} onIndexChange={setIndex} updatedLabel={updatedLabel} showBackLink />
      </main>
    );
  }

  const preview = PREVIEW_SIZES.find((p) => p.id === previewId) ?? PREVIEW_SIZES[1];
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-4 px-4 py-6 text-center">
      <div className="flex w-full items-center justify-start">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 text-sm font-medium text-ink no-underline hover:border-link"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver a la app
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Vista previa del reloj</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
          Simulación en navegador; prueba en el reloj físico pendiente. Usa los botones, las flechas del teclado o desliza
          para cambiar de pantalla.
        </p>
      </div>

      <div role="radiogroup" aria-label="Tamaño de previsualización" className="flex gap-2">
        {PREVIEW_SIZES.map((p) => {
          const on = p.id === preview.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPreviewId(p.id)}
              className={`min-h-11 min-w-[88px] cursor-pointer rounded-xl border px-4 text-sm font-medium ${
                on ? "border-brand bg-brand/25 text-white" : "border-line bg-panel text-ink-2 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <WatchBezel size={preview.px}>
        <WatchDial size={preview.px} level={level} screens={screens} index={index} onIndexChange={setIndex} updatedLabel={updatedLabel} />
      </WatchBezel>

      <p className="m-0 text-xs text-ink-2">
        Esfera de {preview.px} px. Telemetría simulada, no medida; los tamaños son aproximados.
      </p>
    </main>
  );
}

/** Marco circular simulado con CSS (bisel con marcas, pulsadores y correas); sin imagenes. */
function WatchBezel({ size, children }: { size: number; children: ReactNode }) {
  const b = Math.round(size * 0.1);
  const outer = size + 2 * b;
  const metal: CSSProperties = {
    background: "conic-gradient(from 200deg, #5b6678, #d5dbe6, #6b7689, #2b3445, #aab4c4, #4a5568, #5b6678)",
    boxShadow: "0 10px 30px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.18)",
  };
  const ticks: CSSProperties = {
    background: "repeating-conic-gradient(from -0.5deg, #0b1220 0 1deg, transparent 1deg 6deg)",
    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))",
    mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px))",
  };
  const strap = "absolute left-1/2 -translate-x-1/2 bg-panel-2 border border-line";
  return (
    <div
      data-testid="watch-preview-frame"
      role="group"
      aria-label="Marco simulado del reloj"
      className="relative isolate my-10 shrink-0"
      style={{ width: outer, height: outer }}
    >
      <div aria-hidden="true" className={`${strap} -top-9 z-[-1] rounded-t-3xl`} style={{ width: outer * 0.5, height: 56 }} />
      <div aria-hidden="true" className={`${strap} -bottom-9 z-[-1] rounded-b-3xl`} style={{ width: outer * 0.5, height: 56 }} />
      <div aria-hidden="true" className="absolute -right-2 rounded-r-md" style={{ ...metal, top: "28%", width: 10, height: outer * 0.13, borderRadius: 4 }} />
      <div aria-hidden="true" className="absolute -right-1.5 rounded-r-md" style={{ ...metal, top: "52%", width: 8, height: outer * 0.13, borderRadius: 4 }} />
      <div aria-hidden="true" className="absolute inset-0 rounded-full" style={metal} />
      <div aria-hidden="true" className="absolute rounded-full" style={{ ...ticks, inset: Math.round(b * 0.12) }} />
      <div className="absolute rounded-full bg-black" style={{ inset: b - 2, boxShadow: "inset 0 0 0 2px #0b1220" }} />
      <div className="absolute grid place-items-center" style={{ inset: b }}>
        {children}
      </div>
    </div>
  );
}
