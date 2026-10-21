import { queryClient } from "./queryClient";

// Earlier builds' service worker cached every /api/v1/ GET here: one tenant's
// financial data, kept across logouts. Nothing writes it any more; delete it
// from devices that still have it.
const LEGACY_API_CACHE = "api-cache";

export function purgeLegacyApiCache() {
  if ("caches" in window) caches.delete(LEGACY_API_CACHE).catch(() => {});
}

/** Drop everything the previous user loaded, so the next login on this device starts clean. */
export function clearSessionData() {
  queryClient.clear();
  purgeLegacyApiCache();
}
