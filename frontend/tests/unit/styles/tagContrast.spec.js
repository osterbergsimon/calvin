/**
 * Tag contrast contract.
 *
 * Tag text is 12px, so it needs WCAG AA (4.5:1) against every surface it can
 * sit on. The tone text is `color-mix(in srgb, var(--tone) var(--tag-ink),
 * var(--ink))` over `color-mix(in srgb, var(--tone) var(--tag-tint),
 * transparent)`. This reads the shipped theme variables and the real token
 * values, so a new built-in theme cannot quietly dim a tag.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const THEMES = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../backend/data/themes/builtin.json"), "utf-8")
);
const CSS = readFileSync(resolve(__dirname, "../../../src/styles/theme.css"), "utf-8");

const token = name => {
  const match = CSS.match(new RegExp(`${name}:\\s*([0-9.]+)%`));
  return Number(match?.[1]) / 100;
};
const TINT = token("--tag-tint");
const INK = token("--tag-ink");

const parse = hex => {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
};
const linear = channel => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (tone, ink, share) => tone.map((v, i) => Math.round(v * share + ink[i] * (1 - share)));
const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

const surfaces = ["bg-0", "bg-1", "bg-2"];
const tones = ["ok", "warn", "err", "focus"];

describe("Tag contrast across every built-in theme", () => {
  for (const [id, theme] of Object.entries(THEMES)) {
    for (const mode of ["variables", "dark_mode"]) {
      const vars = theme[mode];
      if (!vars) continue;

      it(`${id}${mode === "dark_mode" ? " dark mode" : ""} clears 4.5:1`, () => {
        for (const surface of surfaces) {
          const bg = parse(vars[surface]);
          // Neutral: --ink-2 on the surface.
          expect(
            contrast(parse(vars["ink-2"]), bg),
            `neutral on ${surface}`
          ).toBeGreaterThanOrEqual(4.5);
          for (const tone of tones) {
            const colour = parse(vars[tone]);
            const text = mix(colour, parse(vars.ink), INK);
            const tinted = over(colour, TINT, bg);
            expect(contrast(text, tinted), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it("derives the token values it tests", () => {
    expect(TINT).toBeGreaterThan(0);
    expect(INK).toBeGreaterThan(0);
    expect(INK).toBeLessThan(1);
  });
});
