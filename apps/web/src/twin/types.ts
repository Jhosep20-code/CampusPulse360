import type { CampusResponse, LiveSnapshot } from "@campuspulse/contracts";

/** Capa de datos que colorea los espacios del gemelo. */
export type TwinLayer = "status" | "co2" | "temperature" | "occupancy" | "energy";

/**
 * Contrato entre la app (frontend) y el gemelo 3D (gemelo-digital).
 * El componente por defecto de `src/twin/CampusTwin.tsx` recibe estas props.
 * La app lo carga con React.lazy(() => import("./twin/CampusTwin")).
 */
export interface TwinProps {
  campus: CampusResponse;
  /** null mientras carga la primera instantanea. */
  live: LiveSnapshot | null;
  layer: TwinLayer;
  /** space_id seleccionado o null. */
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string | null) => void;
  /** Espacios a enfocar con la camara (accion focus_spaces del asistente). */
  focusSpaceIds?: string[];
  /** Pisos separados verticalmente. */
  exploded?: boolean;
  /** Nivel visible en aislamiento (null = todos). */
  isolatedLevel?: number | null;
  /** Modo noche: ventanas emisivas segun ocupacion. */
  night?: boolean;
  /** Perfil de calidad; "auto" decide por PerformanceMonitor. */
  quality?: "auto" | "high" | "low";
  className?: string;
}
