import type { CampusResponse, LiveSnapshot } from "@campuspulse/contracts";
import type { TwinPresetId } from "./view";

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
  /** Clic en la losa o el borde de un piso: aislar ese nivel (opcional; sin el, no hay seleccion por piso). */
  onSelectLevel?: (level: number | null) => void;
  /** Modo datos: vidrio y muros semitransparentes para ver el interior (atrio, nucleo, espacios). */
  dataMode?: boolean;
  /** Preset de camara inicial o solicitado desde fuera (Fachada, Aerea, Atrio, Foto). */
  cameraPreset?: TwinPresetId;
  /** Modo noche: ventanas emisivas segun ocupacion. */
  night?: boolean;
  /** Perfil de calidad; "auto" decide por PerformanceMonitor. */
  quality?: "auto" | "high" | "low";
  className?: string;
}
