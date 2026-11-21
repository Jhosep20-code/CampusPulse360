import type { CampusResponse } from "@campuspulse/contracts";
import { api } from "../lib/api";
import { useResource, type Resource } from "./useResource";

/** GET /campus una sola vez. */
export function useCampus(): Resource<CampusResponse> {
  return useResource((signal) => api.campus(signal), []);
}
