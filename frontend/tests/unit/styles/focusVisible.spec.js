/**
 * Accessibility contract for keyboard focus (CLV-65).
 *
 * Every interactive element must show where focus is. Calvin's baseline is one
 * global `:focus-visible` rule in base.css plus component-level rings that use
 * the existing `--focus` token. A rule that removes the outline on focus must
 * therefore provide a replacement (outline, box-shadow or border colour), or
 * carry an explicit `a11y-allow-no-outline` note when focus is programmatic or
 * drawn by an ancestor's `:focus-within`.
 *
 * jsdom cannot compute `:focus-visible`, so this asserts the CSS contract; the
 * end-to-end focus walk (tests/e2e/a11y/focus.spec.js) checks real elements.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(vue|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** Crude rule splitter: enough for Calvin's component style blocks. */
function ruleBlocks(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, " "),
    body,
  }));
}

const removesOutline = body => /outline:\s*(none|0(?:px)?)\b/.test(body);
const hasReplacement = body =>
  /outline:\s*(?!none|0(?:px)?\b)[^;]+/.test(body) ||
  /box-shadow:\s*(?!none\b)[^;]+/.test(body) ||
  /border(?:-[a-z]+)?-color:\s*(?!transparent\b)[^;]+/.test(body);

describe("keyboard focus visibility", () => {
  const baseCss = readFileSync(join(SRC, "styles/base.css"), "utf-8");

  it("provides one global focus-visible ring using the --focus token", () => {
    expect(baseCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
  });

  it("never removes the focus outline without a replacement or a stated reason", () => {
    const offenders = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf-8");
      for (const { selector, body } of ruleBlocks(source)) {
        if (!selector.includes(":focus")) continue;
        if (!removesOutline(body)) continue;
        if (body.includes("a11y-allow-no-outline")) continue;
        if (hasReplacement(body)) continue;
        offenders.push(`${file.replace(SRC + "/", "")}: ${selector}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
