import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, OctagonAlert, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router";

/** Estado global del campus que pinta el anillo de la esfera (siempre con icono y texto). */
export type WatchLevel = "ok" | "warning" | "critical" | "offline";

export interface WatchScreen {
  id: string;
  /** Nombre corto de la pantalla (p. ej. "CO₂ medio"). */
  label: string;
  /** KPI principal. */
  value: string;
  unit?: string;
  /** Linea secundaria opcional. */
  detail?: string;
  /** "text": titulo largo (alerta); "number": cifra grande. */
  kind: "text" | "number";
}

const LEVEL: Record<WatchLevel, { label: string; Icon: LucideIcon; hex: string }> = {
  ok: { label: "OK", Icon: CircleCheck, hex: "#22D3D6" },
  warning: { label: "Advertencia", Icon: TriangleAlert, hex: "#F0B95B" },
  critical: { label: "Crítico", Icon: OctagonAlert, hex: "#FF5C7A" },
  offline: { label: "Sin datos", Icon: WifiOff, hex: "#64748B" },
};

export const WATCH_LEVEL_LABEL: Record<WatchLevel, string> = {
  ok: LEVEL.ok.label,
  warning: LEVEL.warning.label,
  critical: LEVEL.critical.label,
  offline: LEVEL.offline.label,
};

/** Toque minimo de los controles (px CSS). */
const TOUCH = 44;
/** Desplazamiento horizontal minimo para contar como deslizamiento. */
const SWIPE_PX = 32;

interface WatchDialProps {
  /** Diametro de la esfera en px CSS. */
  size: number;
  level: WatchLevel;
  screens: WatchScreen[];
  index: number;
  onIndexChange: (next: number) => void;
  /** Texto de hora de ultima actualizacion (ya formateado). */
  updatedLabel: string;
  /** Enlace para volver a la app dentro de la esfera (solo en modo pantalla completa). */
  showBackLink?: boolean;
}

/**
 * Esfera circular 1:1 para reloj. El texto vive en el circulo inscrito (~70 % del diametro),
 * el anillo y el texto indican el estado y hay tres pantallas navegables con botones de 44 px,
 * teclado o deslizamiento. Las posiciones se calculan a partir de `size` para que nada se corte.
 */
export function WatchDial({ size: S, level, screens, index, onIndexChange, updatedLabel, showBackLink = false }: WatchDialProps) {
  const meta = LEVEL[level];
  const screen = screens[index] ?? screens[0]!;
  const count = screens.length;
  const startX = useRef<number | null>(null);

  const go = (delta: number) => onIndexChange((index + delta + count) % count);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const from = startX.current;
    startX.current = null;
    if (from === null) return;
    const dx = e.clientX - from;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  };

  const ring = Math.max(4, Math.round(S * 0.035));
  const small = Math.max(10, Math.round(S * 0.05));
  const bigNumber = Math.round(S * (screen.value.length >= 5 ? 0.15 : 0.2));
  const titleSize = Math.round(S * (screen.value.length <= 16 ? 0.095 : screen.value.length <= 36 ? 0.078 : 0.066));
  const isText = screen.kind === "text";

  // Zona segura: caja centrada de ~70 % del diametro, desplazada hacia arriba para dejar sitio a los botones.
  const safeW = Math.round(S * 0.7);
  const safeTop = Math.round(S * 0.19);
  const safeH = Math.round(S * 0.48);

  const btnY = Math.round(S * 0.5 + S * 0.25 - TOUCH / 2);
  const btnDx = Math.round(S * 0.21);
  const btn: CSSProperties = { width: TOUCH, height: TOUCH, top: btnY };

  const btnCls =
    "absolute flex cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 p-0 text-white hover:bg-white/20";

  return (
    <section
      aria-roledescription="esfera de reloj"
      aria-label="Esfera de reloj de CampusPulse 360"
      data-testid="watch-dial"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        startX.current = null;
      }}
      onKeyDown={onKeyDown}
      className="relative aspect-square select-none overflow-hidden rounded-full bg-[#080F1D] text-white"
      style={{ width: S, height: S, touchAction: "pan-y" }}
    >
      {/* Anillo de estado: color + (texto del estado dentro de la esfera). */}
      <div
        aria-hidden="true"
        data-testid="watch-ring"
        data-level={level}
        className={`pointer-events-none absolute inset-0 rounded-full ${level === "critical" ? "motion-safe:animate-pulse" : ""}`}
        style={{ border: `${ring}px solid ${meta.hex}`, boxShadow: `inset 0 0 ${Math.round(S * 0.08)}px ${meta.hex}40` }}
      />

      {/* Insignia SIMULADO y hora de ultima actualizacion. */}
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap"
        style={{ top: Math.round(S * 0.09), fontSize: Math.max(9, Math.round(S * 0.044)) }}
      >
        <span className="rounded-full border border-gold/70 bg-gold/10 px-1.5 font-semibold leading-[1.5] tracking-wider text-gold">SIMULADO</span>
        <span className="num text-ink-2">{updatedLabel}</span>
      </div>

      {/* Contenido que se anuncia a lectores de pantalla al cambiar de pantalla o de datos. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ left: (S - safeW) / 2, top: safeTop, width: safeW, height: safeH }}
      >
        <span className="sr-only">{`Pantalla ${index + 1} de ${count}. Estado del campus: ${meta.label}.`}</span>
        <p className="m-0 font-medium leading-tight text-ink-2" style={{ fontSize: small }}>
          {screen.label}
        </p>
        {isText ? (
          <p
            className="m-0 line-clamp-3 w-full break-words font-display font-semibold leading-[1.12] text-white"
            style={{ fontSize: titleSize }}
            title={screen.value}
          >
            {screen.value}
          </p>
        ) : (
          <p className="num m-0 flex items-baseline justify-center gap-1 font-medium leading-none text-white" style={{ fontSize: bigNumber }}>
            <span>{screen.value}</span>
            {screen.unit ? (
              <span className="text-ink-2" style={{ fontSize: Math.round(S * 0.065) }}>
                {screen.unit}
              </span>
            ) : null}
          </p>
        )}
        {screen.detail ? (
          <p className="m-0 leading-tight text-ink-2" style={{ fontSize: small }}>
            {screen.detail}
          </p>
        ) : null}
        <p
          className="m-0 mt-1 inline-flex items-center gap-1 rounded-full border px-2 font-semibold leading-[1.45]"
          style={{ fontSize: Math.max(11, Math.round(S * 0.058)), color: meta.hex, borderColor: `${meta.hex}99` }}
        >
          <meta.Icon size={Math.max(11, Math.round(S * 0.06))} aria-hidden="true" strokeWidth={2.4} />
          <span>{meta.label}</span>
        </p>
      </div>

      {/* Controles de cambio de pantalla (44 px) y puntos de pagina. */}
      <div role="group" aria-label="Cambiar de pantalla">
        <button
          type="button"
          aria-label="Pantalla anterior"
          onClick={() => go(-1)}
          className={btnCls}
          style={{ ...btn, left: Math.round(S / 2 - btnDx - TOUCH / 2) }}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Pantalla siguiente"
          onClick={() => go(1)}
          className={btnCls}
          style={{ ...btn, left: Math.round(S / 2 + btnDx - TOUCH / 2) }}
        >
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </div>

      <ol
        aria-label={`Página ${index + 1} de ${count}`}
        className="absolute m-0 flex list-none items-center gap-1 p-0"
        style={{ left: "50%", top: Math.round(S * 0.75) - 4, transform: "translateX(-50%)" }}
      >
        {screens.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? "step" : undefined}
            aria-label={`${s.label}${i === index ? " (actual)" : ""}`}
            className="block h-2 rounded-full motion-safe:transition-all"
            style={{ width: i === index ? 16 : 8, background: i === index ? "#22D3D6" : "#64748B" }}
          />
        ))}
      </ol>

      {showBackLink ? (
        <Link
          to="/"
          aria-label="Volver a la app"
          className="absolute flex items-center justify-center rounded-full text-ink-2 no-underline hover:text-white"
          style={{ width: TOUCH, height: TOUCH, left: S / 2 - TOUCH / 2, top: Math.round(S * 0.86) - TOUCH / 2 }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
