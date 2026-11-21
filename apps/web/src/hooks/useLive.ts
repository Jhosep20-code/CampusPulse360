import type { LiveSnapshot } from "@campuspulse/contracts";
import { useEffect, useState } from "react";
import { getLive } from "../lib/api";

export type LiveStatus = "live" | "reconnecting" | "offline";

export interface LiveState {
  data: LiveSnapshot | null;
  status: LiveStatus;
  /** Epoch ms de la ultima respuesta correcta (200 o 304). */
  lastUpdated: number | null;
}

export const LIVE_INTERVAL_MS = 10_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
/** Fallos consecutivos antes de declarar "sin conexion". */
const OFFLINE_AFTER_FAILURES = 3;

/**
 * Sondeo de GET /live cada 10 s con If-None-Match/ETag (304 = sin cambios).
 * Se pausa mientras `document.hidden`; reintenta con backoff exponencial.
 */
export function useLive(intervalMs: number = LIVE_INTERVAL_MS): LiveState {
  const [state, setState] = useState<LiveState>({ data: null, status: "reconnecting", lastUpdated: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let etag: string | null = null;
    let failures = 0;
    const ctrl = new AbortController();

    const schedule = (ms: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;
      if (document.hidden) {
        // Pausado: no se consulta la red mientras la pestana esta oculta.
        schedule(intervalMs);
        return;
      }
      try {
        const r = await getLive(etag, ctrl.signal);
        if (cancelled) return;
        failures = 0;
        if (r.kind === "data") {
          etag = r.etag;
          setState({ data: r.data, status: "live", lastUpdated: Date.now() });
        } else {
          setState((s) => ({ ...s, status: "live", lastUpdated: Date.now() }));
        }
        schedule(intervalMs);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        failures += 1;
        const offline = failures >= OFFLINE_AFTER_FAILURES || (typeof navigator !== "undefined" && navigator.onLine === false);
        setState((s) => ({ ...s, status: offline ? "offline" : "reconnecting" }));
        schedule(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1)));
      }
    }

    const onVisibility = () => {
      // Al volver a la pestana se consulta de inmediato.
      if (!document.hidden) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return state;
}
