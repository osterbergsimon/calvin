// Palette presets for the dev UI gallery (docs/design/frontend-doctrine.md §3).
//
// The app applies a theme by writing the palette onto :root (useTheme), so the
// gallery does the same on its own root: the built-in JSON is the single source
// of truth, and the derived tokens a theme relies on are derived here the same
// way theme.css derives them. Calvin is the default theme: no overrides, the
// .light/.dark blocks in theme.css already describe it.
import builtinThemes from "../../../backend/data/themes/builtin.json";

export const GALLERY_THEME_OPTIONS = [
  { value: "calvin", label: "Calvin" },
  { value: "ocean", label: "Ocean" },
  { value: "forest", label: "Forest" },
  { value: "sunset", label: "Sunset" },
];

export const GALLERY_MODE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const THEME_VALUES = GALLERY_THEME_OPTIONS.map(option => option.value);

/**
 * Resolve one gallery preset: the wrapper's dark class plus the palette
 * overrides (custom properties) for a named theme.
 *
 * @param {string} themeName  calvin | ocean | forest | sunset
 * @param {string} mode       light | dark
 */
export function galleryTheme(themeName, mode) {
  const dark = mode === "dark";
  const theme = builtinThemes[themeName];
  if (!themeName || themeName === "calvin" || !THEME_VALUES.includes(themeName) || !theme) {
    return { dark, vars: {} };
  }

  const palette = (dark ? theme.dark_mode : theme.variables) || theme.variables;
  const vars = {};
  for (const [key, value] of Object.entries(palette)) vars[`--${key}`] = value;

  // theme.css derives these from the semantic colours, but a palette set on a
  // descendant does not re-run :root's calculations for it.
  const { focus, ink, "bg-1": bg1, "shadow-hover": shadowHover } = palette;
  if (focus) {
    vars["--focus-glow"] = `color-mix(in srgb, ${focus} 36%, transparent)`;
    vars["--focus-edge"] = `color-mix(in srgb, ${focus} 75%, transparent)`;
  }
  if (ink && bg1) {
    vars["--switch-track-off"] = `color-mix(in srgb, ${ink} 28%, ${bg1})`;
    vars["--switch-knob"] = bg1;
    vars["--switch-knob-on"] = bg1;
  }
  if (shadowHover) {
    vars["--switch-knob-shadow"] = `0 1px 2px ${shadowHover}`;
    vars["--elev-1"] = `0 6px 18px -8px ${shadowHover}`;
    vars["--elev-2"] = `0 18px 50px -16px ${shadowHover}`;
  }

  return { dark, vars };
}
