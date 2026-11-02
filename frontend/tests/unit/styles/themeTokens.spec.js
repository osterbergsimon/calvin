/**
 * Theme token lint (audit §6).
 *
 * Colour lives in theme.css (Calvin) and the built-in/plugin palettes. Two
 * kinds of leftovers are forbidden because they bypass the theme system:
 *   - the retired `--region-*` content-kind colours (D3)
 *   - the Material calendar blue `#2196f3` (replaced by `--event-*`)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");

const walk = dir => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(vue|css|js)$/.test(name)) out.push(path);
  }
  return out;
};

const FILES = walk(SRC).map(file => ({
  file: relative(SRC, file),
  text: readFileSync(file, "utf8"),
}));

describe("theme token lint", () => {
  it("has no retired --region-calendar/photos/service tokens", () => {
    const offenders = FILES.filter(({ text }) =>
      /--region-(?:calendar|photos|service)\b/.test(text)
    ).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("has no Material calendar blue #2196f3", () => {
    const offenders = FILES.filter(({ text }) => text.toLowerCase().includes("#2196f3")).map(
      ({ file }) => file
    );
    expect(offenders).toEqual([]);
  });

  it("defines the event palette for the default theme in both modes", () => {
    const css = FILES.find(({ file }) => file === "styles/theme.css").text;
    for (let i = 1; i <= 8; i += 1) {
      expect(css.match(new RegExp(`--event-${i}:`, "g"))).toHaveLength(2);
    }
  });
});
