/**
 * Token lint for the whole frontend.
 *
 * See docs/design/2026-10-30-chips-and-tags.md §2.1 and
 * docs/design/2026-07-04-ui-sizing-tokens.md: components leave with no
 * hex/rgb/hsl colour literals, no `white`/`black`, no `font-weight: bold`, no
 * raw px/rem font sizes, and radii only from the radius tokens.
 *
 * Scope: every `<style>` block under `src/` and every stylesheet in `src/`,
 * plus the `style` / `:style` bindings in single-file components (a colour or
 * font size written inline is just as unthemeable). Data that happens to be a
 * colour — a calendar's own colour, a plugin's accent — is not a style and is
 * out of scope; those live in `<script>` blocks.
 *
 * Exceptions are explicit and commented in place:
 *
 *   /* token-lint-disable-next-line: <reason> *\/
 *   border-radius: 0.3125rem;
 *
 * The only file-wide exemption is theme.css, where the tokens themselves are
 * defined. Its values are still checked: a colour literal there is only legal
 * as the definition of a custom property.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
const THEME_CSS = "styles/theme.css";

const walk = dir => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(vue|css)$/.test(name)) out.push(relative(SRC, path));
  }
  return out.sort();
};

const FILES = walk(SRC);

/** Blank out comments but keep the line structure (markers stay readable). */
const blankComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ""));

const styleBlocks = file => {
  const source = readFileSync(resolve(SRC, file), "utf-8");
  if (file.endsWith(".css")) return [{ label: file, css: source, raw: source }];
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return blocks.map((m, i) => ({
    label: `${file} <style #${i + 1}>`,
    css: blankComments(m[1]),
    raw: m[1],
  }));
};

/** Inline `style` / `:style` attribute content, one entry per line. */
const inlineStyles = file => {
  if (!file.endsWith(".vue")) return [];
  const source = readFileSync(resolve(SRC, file), "utf-8");
  const template = source.slice(
    0,
    source.indexOf("<script") === -1 ? source.length : source.indexOf("<script")
  );
  return [...template.matchAll(/(:?style)="([^"]*)"/g)].map(m => ({
    label: `${file} ${m[1]}="${m[2].slice(0, 60)}"`,
    text: m[2],
  }));
};

const DISABLE = /token-lint-disable-next-line:\s*\S+/;

const violations = (label, css, rule) => {
  const lines = css.split("\n");
  const found = [];
  lines.forEach((line, index) => {
    const marker = [lines[index - 1], line].some(l => l && DISABLE.test(l));
    if (marker) return;
    for (const match of rule(line)) found.push({ label, line: line.trim(), match });
  });
  return found;
};

/** theme.css may define colour tokens; it may not use a literal anywhere else. */
const tokenDefinitionOnly = (file, line) =>
  file === THEME_CSS && /^\s*--[a-z0-9-]+:\s*[^;]+;\s*(\/\*.*\*\/)?\s*$/.test(line);

const colourLiteral = line => {
  const found = [];
  if (/#[0-9a-f]{3,8}\b/i.test(line)) found.push("hex colour");
  if (/\b(rgb|rgba|hsl|hsla)\(/.test(line)) found.push("rgb()/hsl() colour");
  if (/:\s*[^;]*\b(white|black)\b(?!-)/.test(line)) found.push("white/black keyword");
  return found;
};

const rawFontSize = line => {
  // Any px/rem font size, including inside clamp()/calc()/media adjustments.
  const declarations = line.match(/font-size:[^;]+/g) || [];
  return declarations.some(declaration => /[0-9.]+(px|rem)\b/.test(declaration))
    ? ["raw font size"]
    : [];
};

const boldFace = line => (/font-weight:\s*bold/.test(line) ? ["font-weight: bold"] : []);

const RADIUS_OK = value => {
  const trimmed = value.trim();
  if (["0", "2px", "999px", "50%"].includes(trimmed)) return true;
  // A calc() around a radius token (e.g. SettingsSearch's concentic inset) is
  // still token-driven.
  if (trimmed.includes("var(--radius") || trimmed.includes("var(--tag-radius")) return true;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return false;
  return parts.every(part => RADIUS_OK(part));
};

const rawRadius = line => {
  const found = [];
  for (const match of line.matchAll(/(?:border(?:-[a-z]+)?-radius)\s*:\s*([^;]+);/g)) {
    if (!RADIUS_OK(match[1])) found.push(`radius ${match[1].trim()}`);
  }
  return found;
};

const RULES = [
  ["colour literals", colourLiteral],
  ["raw font sizes", rawFontSize],
  ["bold", boldFace],
  ["radius tokens", rawRadius],
];

describe("token lint: all of frontend/src", () => {
  it("covers the whole source tree", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain(THEME_CSS);
  });

  for (const [name, rule] of RULES) {
    it(`has no ${name} in component styles`, () => {
      const failures = [];
      for (const file of FILES) {
        if (file === THEME_CSS) continue;
        for (const block of styleBlocks(file))
          failures.push(...violations(block.label, block.css, rule));
      }
      expect(failures, `${name}`).toEqual([]);
    });
  }

  it("has no colour literals or raw font sizes in inline style bindings", () => {
    const failures = [];
    for (const file of FILES) {
      for (const inline of inlineStyles(file)) {
        for (const match of [...colourLiteral(inline.text), ...rawFontSize(inline.text)]) {
          failures.push({ label: inline.label, line: inline.text, match });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("lets theme.css define tokens but not use literals", () => {
    const failures = [];
    for (const block of styleBlocks(THEME_CSS)) {
      for (const { line } of violations(block.label, block.css, colourLiteral)) {
        if (!tokenDefinitionOnly(THEME_CSS, line)) failures.push({ label: THEME_CSS, line });
      }
    }
    expect(failures).toEqual([]);
  });

  it("declares the tuned tokens in theme.css", () => {
    const css = readFileSync(resolve(SRC, THEME_CSS), "utf-8");
    for (const token of [
      "--fs-3xs",
      "--focus-ink",
      "--focus-text",
      "--ok-ink",
      "--ok-text",
      "--warn-ink",
      "--warn-text",
      "--err-ink",
      "--err-text",
      "--scrim-solid",
      "--scrim-strong",
      "--on-scrim",
      "--on-event-ink",
      "--on-event-ink-dark",
      "--device-ink",
      "--device-ink-2",
      "--qr-surface",
      "--mask-opaque",
    ]) {
      expect(css, token).toContain(`${token}:`);
    }
  });
});
