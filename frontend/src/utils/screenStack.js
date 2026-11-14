/**
 * Screen stack (experiment): keep every dashboard screen mounted and stacked,
 * and switch by showing a different one, so a page switch can be a compositor
 * operation instead of an unmount + mount + full repaint.
 *
 * Modes:
 *   off        — today's behaviour: only the active screen is mounted.
 *   opacity    — inactive screens stay painted on their own GPU layer at
 *                opacity 0 (will-change: opacity). Fastest switch if the
 *                browser keeps the layer's tiles; costs GPU memory.
 *   visibility — inactive screens stay mounted but visibility: hidden. Saves
 *                the mount/layout work but the browser repaints on switch.
 *
 * Opt in per device with `?screenStack=opacity` (or `visibility`) on the
 * dashboard URL; the choice is remembered in localStorage. `?screenStack=off`
 * turns it off again.
 */

const STORAGE_KEY = "calvin.screenStack";
const MODES = ["off", "opacity", "visibility"];

export function readScreenStackMode() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("screenStack");
    if (fromQuery && MODES.includes(fromQuery)) {
      window.localStorage.setItem(STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : "off";
  } catch {
    return "off";
  }
}
