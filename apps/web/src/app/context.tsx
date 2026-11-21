import type { CampusResponse, Role, SessionInfo, Space } from "@campuspulse/contracts";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCampus } from "../hooks/useCampus";
import { useLive, type LiveState } from "../hooks/useLive";
import type { Resource } from "../hooks/useResource";
import { useSession } from "../hooks/useSession";

const noop = () => {};

export const LiveContext = createContext<LiveState>({ data: null, status: "offline", lastUpdated: null });
export const CampusContext = createContext<Resource<CampusResponse>>({
  data: null,
  error: null,
  loading: false,
  reload: noop,
});
export const SessionContext = createContext<Resource<SessionInfo>>({
  data: null,
  error: null,
  loading: false,
  reload: noop,
});

/** Un unico sondeo /live, un unico /campus y una unica sesion para toda la app. */
export function AppProviders({ children }: { children: ReactNode }) {
  const live = useLive();
  const campus = useCampus();
  const session = useSession();
  return (
    <LiveContext.Provider value={live}>
      <CampusContext.Provider value={campus}>
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      </CampusContext.Provider>
    </LiveContext.Provider>
  );
}

export const useLiveCtx = () => useContext(LiveContext);
export const useCampusCtx = () => useContext(CampusContext);
export const useSessionCtx = () => useContext(SessionContext);

export function useRole(): { role: Role; name: string | null; canOperate: boolean; isAdmin: boolean; authenticated: boolean } {
  const { data } = useSessionCtx();
  const role: Role = data?.role ?? "visitor";
  return {
    role,
    name: data?.name ?? null,
    authenticated: data?.authenticated ?? false,
    isAdmin: role === "admin",
    canOperate: role === "admin" || role === "operator",
  };
}

/** Mapa id -> espacio para resolver nombres. */
export function useSpaceIndex(): Map<string, Space> {
  const { data } = useCampusCtx();
  return useMemo(() => new Map((data?.spaces ?? []).map((s) => [s.id, s])), [data]);
}
