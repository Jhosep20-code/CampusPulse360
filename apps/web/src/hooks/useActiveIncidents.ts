import type { Incident } from "@campuspulse/contracts";
import { useMemo } from "react";
import { api } from "../lib/api";
import { severityRank } from "../lib/status";
import { useResource, type Resource } from "./useResource";

/** Incidencias no resueltas, mas graves primero. Se recarga cuando cambia el conteo del KPI. */
export function useActiveIncidents(openCount: number | undefined): Resource<Incident[]> {
  const res = useResource(async (signal) => (await api.incidents({ limit: 50 }, signal)).items, [openCount]);
  const active = useMemo(
    () =>
      (res.data ?? [])
        .filter((i) => i.status !== "resolved")
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.opened_at - a.opened_at),
    [res.data],
  );
  return { ...res, data: res.data ? active : null };
}
