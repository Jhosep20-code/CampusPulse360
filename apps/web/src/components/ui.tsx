import { CircleAlert, Inbox, RefreshCw } from "lucide-react";
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";

/* ----------------------------------------------------------------- estructura */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "p-4",
  as: Tag = "section",
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "aside" | "article";
}) {
  return (
    <Tag className={`panel ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {icon ? <span className="text-link">{icon}</span> : null}
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/* ----------------------------------------------------------------- estados */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4, className = "h-12" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`w-full ${className}`} />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando página">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="text-ink-2">{icon ?? <Inbox size={28} aria-hidden="true" />}</span>
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-2">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "No se pudo cargar la información",
}: {
  error: Error | null;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <CircleAlert size={28} className="text-crit" aria-hidden="true" />
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-2">
        {error?.message ?? "Error desconocido"}
        {error instanceof Error && "detail" in error && typeof error.detail === "string" ? ` (${error.detail})` : ""}
      </p>
      <p className="max-w-md text-xs text-ink-2">Verifica que la API esté levantada (wrangler dev en el puerto 8787).</p>
      {onRetry ? (
        <button type="button" className="btn btn-sm mt-1" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Reintentar
        </button>
      ) : null}
    </div>
  );
}

/** Mensaje inline de resultado de una accion (role=status). */
export function Notice({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${
        kind === "error" ? "border-crit/40 bg-crit/10 text-crit" : "border-ok/40 bg-ok/10 text-ok"
      }`}
    >
      {children}
    </p>
  );
}

/* ----------------------------------------------------------------- medidor */

export function Meter({
  value,
  max,
  label,
  warnAt = 0.7,
  critAt = 0.9,
}: {
  value: number;
  max: number;
  label: string;
  warnAt?: number;
  critAt?: number;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const color = ratio >= critAt ? "#FF5C7A" : ratio >= warnAt ? "#F0B95B" : "#22D3D6";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-[#0c1526]"
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${ratio * 100}%`, background: color }} />
    </div>
  );
}

/* ----------------------------------------------------------------- pulso */

/** Muestra un valor y emite un pulso breve cuando cambia (desactivado con reduced-motion via CSS). */
export function PulseValue({ value, className = "" }: { value: string | number; className?: string }) {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setTick((t) => t + 1);
    }
  }, [value]);
  return (
    <span key={tick} className={`${tick > 0 ? "pulse-change" : ""} ${className}`}>
      {value}
    </span>
  );
}

/* ----------------------------------------------------------------- errores de render */

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
  }
  override render() {
    if (this.state.error) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}
