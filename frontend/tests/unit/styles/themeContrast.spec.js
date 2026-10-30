/**
 * Theme contrast contract.
 *
 * Every text/background token pair the frontend actually uses must clear WCAG
 * AA in all five built-in themes, in both light and dark mode:
 *
 *   - body text               >= 4.5:1
 *   - large text / UI glyphs  >= 3:1  (>= 1.125rem)
 *
 * Pairs are derived from the component styles themselves: a rule that sets both
 * `color` and a `background` is a pair; a colour set on its own can land on any
 * of the three surfaces and is tested against all of them. `color-mix()` text
 * (the tone tints) is resolved to its real RGB before measuring, so a tint that
 * dims a label is caught here as well.
 *
 * Two kinds of ink are deliberately out of the surface scan, with the reason
 * recorded below, and are checked against the surface they really sit on:
 *   - `--on-scrim`      is composited over photo/video content → `--scrim-solid`
 *   - `--device-ink`    is drawn on the device mockup screen    → `--device-screen`
 *   - `--on-event-ink`  is painted on a calendar's own colour (user data, so
 *                       it cannot be measured); it has no theme surface.
 *
 * Only theme-owned colours are checked. A component-local variable that holds
 * runtime data (a calendar's colour, a plugin's accent) is not a theme surface.
 *
 * Failures are fixed in the theme tokens, never per component.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { palettes, parse, contrast, mix as mixRgb, THEME_CSS } from "./contrast";

const SRC = resolve(__dirname, "../../../src");
const SURFACES = ["bg-0", "bg-1", "bg-2"];

/** Dedicated contract test: tag tints need the alpha composite maths. */
const SKIP_FILES = new Set(["components/ui/Tag.vue"]);

/** Ink that sits on content rather than on a theme surface. */
const CONTENT_INK = {
  "on-scrim": "scrim-solid",
  "device-ink": "device-screen",
  "on-event-ink": null, // painted on the calendar's own (user) colour
};

const walk = dir => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(vue|css)$/.test(name)) out.push(path);
  }
  return out;
};

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Declaration blocks of a stylesheet, with at-rules flattened. */
const blocks = css =>
  stripComments(css)
    .split("}")
    .map(chunk => chunk.slice(chunk.lastIndexOf("{") + 1))
    .filter(Boolean);

const SOURCES = walk(SRC)
  .filter(file => !file.endsWith("styles/theme.css"))
  .map(file => ({ file: relative(SRC, file), file_: file }))
  .filter(({ file }) => !SKIP_FILES.has(file))
  .map(({ file, file_ }) => {
    const source = readFileSync(file_, "utf-8");
    const css = file.endsWith(".vue")
      ? [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n")
      : source;
    return { file, css };
  });

/** Hex-valued custom properties declared in theme.css, constant across themes. */
const CONSTANTS = new Map(
  [...THEME_CSS.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/gm)].map(m => [
    m[1].slice(2),
    m[2],
  ])
);

const TOKEN = /var\(--([a-z0-9-]+)\)/g;
const tokensIn = value => [...value.matchAll(TOKEN)].map(m => m[1]);

const isThemeColour = name => palettes().some(({ vars }) => typeof vars[name] === "string");
const isKnown = name => CONSTANTS.has(name) || isThemeColour(name);

/** First token in a value that has a known hex colour (theme or constant). */
const knownToken = value => tokensIn(value).find(isKnown);

/**
 * Resolve a text colour to something measurable:
 *   { kind: "token", token }            e.g. `var(--ink-2)`
 *   { kind: "mix", a, b, share }        e.g. `color-mix(in srgb, var(--warn) 45%, var(--ink))`
 *   null                                a runtime value (event/plugin colour)
 */
const textSpec = value => {
  if (!value.includes("color-mix(")) {
    const token = knownToken(value);
    return token ? { kind: "token", token } : null;
  }
  const match = value.match(
    /color-mix\(\s*in srgb,\s*var\(--([a-z0-9-]+)\)(?:\s+([0-9.]+)%)?\s*,\s*var\(--([a-z0-9-]+)\)(?:\s+([0-9.]+)%)?\s*\)/
  );
  if (!match) return null;
  const [, a, aPercent, b, bPercent] = match;
  if (!isKnown(a) || !isKnown(b)) return null;
  if (aPercent !== undefined) return { kind: "mix", a, b, share: Number(aPercent) / 100 };
  if (bPercent !== undefined) return { kind: "mix", a, b, share: 1 - Number(bPercent) / 100 };
  return { kind: "mix", a, b, share: 0.5 };
};

/**
 * Background token for a `background` declaration. A `color-mix()` against a
 * surface is that surface; a mix against `transparent` inherits whatever is
 * underneath, so it contributes no pair of its own.
 */
const backgroundToken = value => {
  if (!value.includes("color-mix(")) return knownToken(value);
  const solid = tokensIn(value).filter(token => token.startsWith("bg-"));
  return solid.length ? solid[solid.length - 1] : undefined;
};

const LARGE_FS_TOKENS = new Set(["--fs-lg", "--fs-xl", "--fs-2xl", "--fs-3xl"]);

const isLarge = block => {
  const size = block.match(/font-size:\s*([^;]+);/);
  if (!size) return false;
  const value = size[1].trim();
  const token = value.match(/^var\(--(fs-[a-z0-9-]+)\)$/);
  if (token) return LARGE_FS_TOKENS.has(`--${token[1]}`);
  const rem = value.match(/^([0-9.]+)rem$/);
  if (rem) return Number(rem[1]) >= 1.125;
  const px = value.match(/^([0-9.]+)px$/);
  if (px) return Number(px[1]) >= 18;
  return false;
};

const PAIRS = (() => {
  const pairs = new Map();
  const add = (fg, bg, large, file) => {
    const key = `${JSON.stringify(fg)}|${bg}|${large}`;
    if (!pairs.has(key)) pairs.set(key, { fg, bg, large, files: new Set() });
    pairs.get(key).files.add(file);
  };

  for (const { file, css } of SOURCES) {
    for (const block of blocks(css)) {
      const color = block.match(/(?:^|[;\s])color:\s*([^;]+);/);
      if (!color) continue;
      const fg = textSpec(color[1]);
      if (!fg) continue;
      const token = fg.kind === "token" ? fg.token : undefined;
      const contentSurface =
        token && Object.hasOwn(CONTENT_INK, token) ? CONTENT_INK[token] : "inherit";
      if (contentSurface === null) continue;
      if (contentSurface !== "inherit") {
        add(fg, contentSurface, isLarge(block), file);
        continue;
      }
      const background = block.match(/background(?:-color)?:\s*([^;]+);/);
      const bg = background ? backgroundToken(background[1]) : undefined;
      if (bg) add(fg, bg, isLarge(block), file);
      else for (const surface of SURFACES) add(fg, surface, isLarge(block), file);
    }
  }
  return [...pairs.values()];
})();

/** Resolve a token to RGB for a palette: palette value, else theme.css constant. */
const rgbOf = (palette, name) => {
  const value = palette.vars[name] ?? CONSTANTS.get(name);
  expect(value, `no colour for --${name}`).toBeTruthy();
  return parse(value);
};

const rgbOfSpec = (palette, spec) =>
  spec.kind === "token"
    ? rgbOf(palette, spec.token)
    : mixRgb(rgbOf(palette, spec.a), rgbOf(palette, spec.b), spec.share);

const describeSpec = spec =>
  spec.kind === "token" ? spec.token : `mix(${spec.a} ${spec.share}, ${spec.b})`;

const check = (palette, pair) => {
  const ratio = contrast(rgbOfSpec(palette, pair.fg), rgbOf(palette, pair.bg));
  const required = pair.large ? 3 : 4.5;
  return { ratio, required };
};

describe("theme contrast: text/background token pairs used in components", () => {
  it("finds the pairs it is supposed to check", () => {
    expect(PAIRS.length).toBeGreaterThan(10);
    expect(PAIRS.some(pair => pair.bg === "focus")).toBe(true);
    expect(PAIRS.some(pair => pair.bg === "bg-2")).toBe(true);
    expect(PAIRS.some(pair => pair.fg.kind === "mix")).toBe(true);
  });

  it("checks the content inks against the surface they sit on", () => {
    const pairs = PAIRS.map(pair => `${describeSpec(pair.fg)} on ${pair.bg}`);
    expect(pairs).toContain("on-scrim on scrim-solid");
    expect(pairs).toContain("device-ink on device-screen");
    // Calendar chips are painted in the calendar's own colour; there is no
    // theme surface to measure, which is why they use a fixed light ink.
    expect(pairs.some(pair => pair.startsWith("on-event-ink"))).toBe(false);
  });

  it("defines the surface pair for every text token", () => {
    const fgs = new Set(PAIRS.filter(pair => pair.fg.kind === "token").map(pair => pair.fg.token));
    expect(fgs.has("ink")).toBe(true);
    expect(fgs.has("ink-2")).toBe(true);
    expect(fgs.has("ink-3")).toBe(true);
  });

  for (const palette of palettes()) {
    it(`${palette.id}${palette.mode === "dark" ? " dark" : ""} clears AA for every used pair`, () => {
      const failures = PAIRS.map(pair => {
        const { ratio, required } = check(palette, pair);
        return ratio < required
          ? `${describeSpec(pair.fg)} on ${pair.bg}: ${ratio.toFixed(2)} < ${required} (${[...pair.files].join(", ")})`
          : null;
      }).filter(Boolean);
      expect(failures, "contrast failures").toEqual([]);
    });
  }
});
