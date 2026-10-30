/**
 * Recovery from a failed lazy-route chunk load (CLV-28).
 *
 * Every route component is loaded on demand, so a client-side navigation
 * (`router.push`) has to fetch the route's hashed chunk first. A page that has
 * been open across a deploy is running an older build whose chunk names no
 * longer exist on the server: the import 404s, Vue Router aborts the
 * navigation, and the app looks dead — clicking ⋯ › Settings does nothing at
 * all, while typing /settings in the address bar works because a full load
 * picks up the current index.html and the current chunk names.
 *
 * Do what the address bar does: one full navigation to the target route. The
 * guard keeps a retry from looping when the route still cannot load (we are
 * already at the target, so a reload would fail exactly the same way).
 */

// Worded per engine: Chromium/Firefox ("Failed to fetch…" / "error loading…")
// and WebKit ("Importing a module script failed.").
const CHUNK_LOAD_ERROR =
  /dynamically imported module|importing a module script failed|error loading dynamically imported module/i;

/** True when `error` is a lazy-route chunk failing to load. */
export function isChunkLoadError(error) {
  return CHUNK_LOAD_ERROR.test(String(error?.message || ""));
}

/**
 * Full-navigate to the route the app failed to reach, so a stale client
 * recovers instead of silently doing nothing.
 *
 * @param {unknown} error  the navigation error (Vue Router's `onError` arg)
 * @param {{ fullPath?: string } | null | undefined} to  the target route
 * @param {Location | { pathname: string, search: string, assign: (url: string) => void }} [location]
 * @returns {boolean} true when a full navigation was started
 */
export function recoverFromChunkLoadError(
  error,
  to,
  location = typeof window !== "undefined" ? window.location : null
) {
  if (!location || !isChunkLoadError(error)) return false;
  const target = to?.fullPath || location.pathname + location.search;
  if (target === location.pathname + location.search) return false;
  location.assign(target);
  return true;
}
