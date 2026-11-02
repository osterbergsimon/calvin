/**
 * Service-worker lifecycle helpers for long-lived pages (CLV-29).
 *
 * A kiosk can keep one page open for days. The browser only checks for a new
 * deploy on navigation, so these helpers (a) reload the page when a new worker
 * takes over, and (b) poll `registration.update()` while the page stays put.
 *
 * The reload decision is kept apart from the browser calls so it can be tested
 * without a real service worker.
 */

export const RELOAD_GUARD_KEY = "calvin-sw-reload-at";

// A reload loop (a broken deploy that keeps replacing its own worker) must not
// be able to put the page in a permanent refresh cycle.
export const RELOAD_GUARD_MS = 30 * 1000;

// Cheap: `update()` re-fetches sw.js (a few hundred bytes), then the browser
// installs the new worker only when the bytes changed.
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function lastReloadAt(storage) {
  try {
    const value = Number(storage?.getItem(RELOAD_GUARD_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Should the page reload for this `controllerchange`?
 *
 * The first worker to claim a page (previous controller null) is the first
 * install of the build the page is already running, so reloading buys nothing.
 * Any later replacement means a new deploy is in control.
 */
export function shouldReloadOnControllerChange({
  previousController,
  nextController,
  storage = globalThis.sessionStorage,
  now = Date.now(),
  guardMs = RELOAD_GUARD_MS,
}) {
  if (!previousController || !nextController) return false;
  if (previousController === nextController) return false;

  const last = lastReloadAt(storage);
  return !(last > 0 && now - last < guardMs);
}

/** Persist the reload time before navigating, so the next page load can guard. */
export function markControllerReload({
  storage = globalThis.sessionStorage,
  now = Date.now(),
} = {}) {
  try {
    storage?.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // Storage may be unavailable (private mode, quota); reloading without the
    // guard is still better than staying on a stale build.
  }
}

/**
 * Ask the service worker for a new deploy now and, after that, every
 * `intervalMs`, whenever the page becomes visible, and when the network
 * returns. Returns the check function (useful for tests).
 */
export function startUpdateChecks(
  registration,
  {
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
    setIntervalFn = globalThis.setInterval,
    documentObj = globalThis.document,
    windowObj = globalThis.window,
  } = {}
) {
  const check = () => {
    try {
      Promise.resolve(registration.update()).catch(() => {});
    } catch {
      // A failed check just means the next one has to succeed.
    }
  };

  setIntervalFn(check, intervalMs);
  documentObj?.addEventListener("visibilitychange", () => {
    if (documentObj.visibilityState === "visible") check();
  });
  windowObj?.addEventListener("online", check);

  return check;
}
