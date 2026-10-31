// Palette helpers for previews. Calvin's palette is mirrored in
// `calvinPalette.js` (theme.css is the source; a unit test pins them together).
import { CALVIN_PALETTE } from "./calvinPalette";

export { CALVIN_PALETTE };

/** The eight calendar colours, as CSS custom-property names. */
export const EVENT_TOKENS = Array.from({ length: 8 }, (_, i) => `--event-${i + 1}`);

const channel = value => Math.max(0, Math.min(255, Math.round(value)));

/** `#rrggbb` from a computed CSS colour (`#abc`, `rgb(...)`, `rgba(...)`). */
export function cssColourToHex(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text)) {
    const raw = text.slice(1);
    const full = raw.length === 3 ? [...raw].map(c => c + c).join("") : raw.slice(0, 6);
    return `#${full.toLowerCase()}`;
  }
  const match = text.match(/^rgba?\(([^)]*)\)$/i);
  if (!match) return null;
  const [r, g, b] = match[1]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => channel(parseFloat(part)));
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The current theme's calendar swatches, resolved to the hex a colour input
 * (and the backend's stored calendar colour) needs. Empty outside the browser.
 * Pass an element to read a theme scoped to it (the UI gallery applies its
 * theme on a wrapper, not on :root).
 */
export function eventSwatches(element) {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return [];
  const target = element || document.documentElement;
  const styles = getComputedStyle(target);
  return EVENT_TOKENS.map((token, index) => ({
    token,
    number: index + 1,
    hex: cssColourToHex(styles.getPropertyValue(token)),
  })).filter(swatch => swatch.hex);
}

/** The first event colour not already used by a calendar source. */
export function nextEventColour(existing = []) {
  const used = new Set(
    existing
      .map(colour => String(colour || "").toLowerCase())
      .filter(colour => colour.startsWith("#"))
  );
  const swatches = eventSwatches();
  const free = swatches.find(swatch => !used.has(swatch.hex));
  return (free || swatches[0])?.hex || "#863427";
}

/**
 * The palette a theme uses in one mode. `null`/`calvin` is the theme.css
 * default; anything else uses its `variables` (light) or `dark_mode` (dark).
 */
export function themePalette(theme, dark) {
  if (!theme || theme.id === "calvin") return dark ? CALVIN_PALETTE.dark : CALVIN_PALETTE.light;
  const palette = (dark ? theme.dark_mode : theme.variables) || theme.variables || {};
  return palette;
}
