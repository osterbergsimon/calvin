/**
 * WCAG contrast helpers shared by the theme contract tests.
 *
 * Themes ship as CSS custom properties in two places: the defaults in
 * `src/styles/theme.css` (`:root` / `.dark`) and the five built-in themes in
 * `backend/data/themes/builtin.json`. Both are read here so a change to either
 * is caught by `tagContrast.spec.js` and `themeContrast.spec.js`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const THEMES = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../backend/data/themes/builtin.json"), "utf-8")
);

export const THEME_CSS = readFileSync(resolve(__dirname, "../../../src/styles/theme.css"), "utf-8");

/** Parse `#rgb` / `#rrggbb` into `[r, g, b]`. */
export const parse = hex => {
  let value = String(hex).trim().replace("#", "");
  if (value.length === 3) value = [...value].map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
};

const linear = channel => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG 2.x contrast ratio between two RGB triples. */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Mix `share` of `a` into `b` (mirrors `color-mix(in srgb, a N%, b)`). */
export const mix = (a, b, share) => a.map((v, i) => Math.round(v * share + b[i] * (1 - share)));

/** Composite `fg` at `alpha` over `bg`. */
export const over = (fg, alpha, bg) =>
  fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

/** Percentage of a `--name: <number>%` custom property in theme.css. */
export const percentage = name => {
  const match = THEME_CSS.match(new RegExp(`${name}:\\s*([0-9.]+)%`));
  return Number(match?.[1]) / 100;
};

/**
 * Every theme × mode a built-in theme can render: the five themes each carry a
 * light (`variables`) and a dark (`dark_mode`) palette.
 */
export const palettes = () => {
  const out = [];
  for (const [id, theme] of Object.entries(THEMES)) {
    for (const [mode, key] of [
      ["light", "variables"],
      ["dark", "dark_mode"],
    ]) {
      const vars = theme[key];
      if (vars) out.push({ id, mode, vars });
    }
  }
  return out;
};
