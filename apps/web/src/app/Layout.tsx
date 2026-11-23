import {
  Activity,
  Bot,
  Cpu,
  Ellipsis,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Radio,
  ServerCog,
  Siren,
  Smartphone,
  UserRound,
  Watch,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Wordmark } from "../components/Logo";
import { ErrorBoundary, ErrorState, PageSkeleton } from "../components/ui";
import type { LiveStatus } from "../hooks/useLive";
import { fmtTime } from "../lib/format";
import { useLiveCtx, useRole, useSessionCtx } from "./context";

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Mando", Icon: LayoutDashboard, end: true },
  { to: "/incidentes", label: "Incidencias", Icon: Siren },
  { to: "/asistente", label: "Asistente", Icon: MessageSquare },
  { to: "/iot", label: "IoT", Icon: Cpu },
];

const MORE_NAV: NavItem[] = [
  { to: "/automatizaciones", label: "Automatizaciones", Icon: Bot },
  { to: "/sistema", label: "Sistema", Icon: ServerCog },
  { to: "/acceso", label: "Acceso", Icon: KeyRound },
  { to: "/ar", label: "AR", Icon: Smartphone },
  { to: "/watch", label: "Vista de reloj", Icon: Watch },
];

const DESKTOP_NAV: NavItem[] = [...MAIN_NAV, ...MORE_NAV];

/* ----------------------------------------------------------------- indicadores de cabecera */

const CONNECTION: Record<LiveStatus, { label: string; Icon: LucideIcon; cls: string }> = {
  live: { label: "En vivo", Icon: Radio, cls: "text-ok border-ok/40 bg-ok/10" },
  reconnecting: { label: "Reconectando", Icon: Activity, cls: "text-warn border-warn/40 bg-warn/10" },
  offline: { label: "Sin conexión", Icon: WifiOff, cls: "text-ink-2 border-off/50 bg-off/15" },
};

export function SimBadge() {
  return (
    <span
      title="Todos los datos de telemetría son simulados; no hay sensores físicos conectados."
      className="inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold"
    >
      <FlaskConical size={13} aria-hidden="true" />
      Simulado
    </span>
  );
}

export function ConnectionBadge() {
  const { status, lastUpdated } = useLiveCtx();
  const c = CONNECTION[status];
  return (
    <span
      role="status"
      aria-label={`Conexión: ${c.label}`}
      title={lastUpdated ? `Última actualización ${fmtTime(lastUpdated, true)}` : "Sin datos todavía"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.cls}`}
    >
      <c.Icon size={13} aria-hidden="true" />
      <span>{c.label}</span>
      {status === "live" && lastUpdated ? (
        <span className="num hidden text-[11px] text-ink-2 sm:inline">{fmtTime(lastUpdated, true)}</span>
      ) : null}
    </span>
  );
}

export function SessionBadge() {
  const { loading, error } = useSessionCtx();
  const { authenticated, role, name } = useRole();
  const text = loading
    ? "Sesión…"
    : error
      ? "Sesión no disponible"
      : authenticated
        ? `${name ?? "Usuario"} · ${role === "admin" ? "Admin" : "Operador"}`
        : "Visitante";
  const Icon = authenticated ? Wifi : UserRound;
  return (
    <NavLink
      to="/acceso"
      aria-label={`Sesión: ${text}`}
      className="inline-flex max-w-[11rem] items-center gap-1.5 truncate rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink no-underline hover:border-link"
    >
      <Icon size={13} aria-hidden="true" className={authenticated ? "text-ok" : "text-ink-2"} />
      <span className="truncate">{text}</span>
    </NavLink>
  );
}

/* ----------------------------------------------------------------- navegacion */

function navClass(isActive: boolean) {
  return `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors ${
    isActive ? "bg-brand/20 text-white ring-1 ring-brand/60" : "text-ink-2 hover:bg-panel-2 hover:text-ink"
  }`;
}

function SideRail() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-[#0a1424]/95 px-3 py-4 backdrop-blur lg:flex">
      <div className="px-2 pb-5 pt-1">
        <Wordmark />
      </div>
      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1">
        {DESKTOP_NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} {...(end ? { end } : {})} className={({ isActive }) => navClass(isActive)}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <p className="px-2 text-[11px] leading-snug text-ink-2">
        Prototipo académico. Telemetría simulada, no medida.
      </p>
    </aside>
  );
}

function BottomBar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const moreActive = MORE_NAV.some((m) => pathname.startsWith(m.to));
  const tab = "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium no-underline";

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true">
          <div className="absolute inset-0 bg-black/55" />
        </div>
      ) : null}
      {open ? (
        <div
          id="menu-mas"
          role="dialog"
          aria-label="Más secciones"
          className="safe-bottom fixed inset-x-3 bottom-[68px] z-50 rounded-2xl border border-line bg-panel p-2 shadow-2xl lg:hidden"
        >
          <ul className="m-0 list-none p-0">
            {MORE_NAV.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => navClass(isActive)}>
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <nav
        aria-label="Navegación inferior"
        className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-[#0a1424]/95 backdrop-blur lg:hidden"
      >
        {MAIN_NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            {...(end ? { end } : {})}
            className={({ isActive }) => `${tab} ${isActive ? "text-white" : "text-ink-2"}`}
          >
            {({ isActive }) => (
              <>
                <span className={`rounded-full px-4 py-1 ${isActive ? "bg-brand/30 text-white" : ""}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-mas"
          aria-label="Más"
          onClick={() => setOpen((o) => !o)}
          className={`${tab} cursor-pointer border-0 bg-transparent ${open || moreActive ? "text-white" : "text-ink-2"}`}
        >
          <span className={`rounded-full px-4 py-1 ${open || moreActive ? "bg-brand/30" : ""}`}>
            {open ? <X size={20} aria-hidden="true" /> : <Ellipsis size={20} aria-hidden="true" />}
          </span>
          Más
        </button>
      </nav>
    </>
  );
}

/* ----------------------------------------------------------------- layout */

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen">
      <a
        href="#contenido"
        className="sr-only-focusable fixed left-3 top-3 z-[60] rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
      >
        Saltar al contenido
      </a>
      <SideRail />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="lg:hidden">
            <Wordmark compact />
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <SimBadge />
            <ConnectionBadge />
            <SessionBadge />
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-28 pt-5 outline-none sm:px-6 lg:pb-10">
          <ErrorBoundary
            key={pathname}
            fallback={(error, reset) => <ErrorState error={error} onRetry={reset} title="Error al mostrar la página" />}
          >
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
