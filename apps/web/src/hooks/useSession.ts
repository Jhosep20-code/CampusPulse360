import type { SessionInfo } from "@campuspulse/contracts";
import { api } from "../lib/api";
import { useResource, type Resource } from "./useResource";

/** GET /auth/session. */
export function useSession(): Resource<SessionInfo> {
  return useResource((signal) => api.session(signal), []);
}
