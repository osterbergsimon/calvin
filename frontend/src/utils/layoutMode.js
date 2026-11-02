/**
 * calvin-tnkg — force the desktop or the phone layout on a screen.
 *
 * Auto (the default) lets the viewport decide, exactly as before
 * (styles/breakpoints.js). Desktop or Phone is one class on <html>, which both
 * the JS breakpoints and the `--bp-phone` custom media read. The screens and
 * CSS therefore never disagree about which layout is in force.
 *
 * Where the choice lives: on a kiosk it is that screen's override
 * (composables/useScreenSetting.js, key `layoutMode`); any other browser keeps
 * its own choice in localStorage. `resolveLayoutMode` is the one place that
 * says which source wins.
 */
import { LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS } from "../styles/breakpoints.js";

/** The three choices, in the order the Settings row shows them. */
export const LAYOUT_MODES = Object.freeze(["auto", "desktop", "phone"]);

/** localStorage key for a browser's own choice (not a kiosk's). */
export const LAYOUT_STORAGE_KEY = "calvin-layout-mode";

/** A stored/served value that is not one of the choices means Auto. */
export const normalizeLayoutMode = value => (LAYOUT_MODES.includes(value) ? value : "auto");

/**
 * The effective choice: a kiosk's screen setting wins there, otherwise this
 * browser's own choice. Auto when neither has one.
 *
 * @param {{ kiosk?: boolean, screenValue?: string|null, browserValue?: string|null }} sources
 */
export function resolveLayoutMode({ kiosk = false, screenValue = null, browserValue = null } = {}) {
  return normalizeLayoutMode(kiosk ? screenValue : browserValue);
}

/**
 * Mark <html> with the effective layout. Auto removes both classes, so the
 * viewport rules decide again. Returns the normalized mode that was applied.
 */
export function applyLayoutMode(mode) {
  const normalized = normalizeLayoutMode(mode);
  if (typeof document === "undefined") return normalized;
  const classes = document.documentElement?.classList;
  if (!classes) return normalized;
  classes.toggle(LAYOUT_DESKTOP_CLASS, normalized === "desktop");
  classes.toggle(LAYOUT_PHONE_CLASS, normalized === "phone");
  return normalized;
}
