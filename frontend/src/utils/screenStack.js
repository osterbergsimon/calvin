/**
 * Screen stack: keep every dashboard screen mounted and stacked, and switch by
 * showing a different one, so a page switch does not unmount, mount and repaint
 * a whole screen. Hidden screens stay mounted with `visibility: hidden`, `inert`
 * and `aria-hidden`, and pause their own work through ScreenScope.
 *
 * It is a per-screen setting, off by default: `keepScreensReady` in a kiosk's
 * overrides (Settings › Screens › the screen › Display, "Faster page
 * switching"). On a Pi 3B+ it makes a warm page switch about 3x faster at no
 * memory cost; the screen takes about a second longer to start.
 *
 * A browser that is not a known kiosk follows no setting and keeps the stack
 * off. `?screenStack=on|off` on the dashboard URL overrides the setting for
 * that one load, for testing only: it is not remembered.
 */

/** `true` / `false` for `?screenStack=on|off`, or `null` when the URL has none. */
export function readScreenStackOverride() {
  try {
    const value = new URLSearchParams(window.location.search).get("screenStack");
    if (value === "on") return true;
    if (value === "off") return false;
  } catch {
    // No window or an unreadable URL: no override.
  }
  return null;
}

/**
 * Whether the screen stack is wanted: the one-load URL override when there is
 * one, else the current kiosk's `keepScreensReady` (a non-kiosk browser is off).
 */
export function wantsScreenStack({ kioskId, keepScreensReady, override = null }) {
  if (override !== null) return override;
  return Boolean(kioskId) && keepScreensReady === true;
}
