/**
 * A Raspberry Pi kiosk (cog / WPE WebKit) cannot afford a full-screen or
 * full-region CSS backdrop blur: every frame of a fade-in, or every photo
 * change, re-runs the blur over the whole surface. The dashboard therefore
 * uses solid or translucent colour instead.
 *
 * The one exception is the opt-in "full" effects level (calvin-uudb): a fast
 * screen may use the expensive look, but only when the rule sits under
 * [data-effects="full"] on <html>. The attribute is the contract; a rule that
 * forgets it would apply on the Pi 3B+ too, so this guard is strict. The
 * allowlist stays empty on purpose.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const SRC = resolve(__dirname, "../../../src");

// Expected: empty. Add a path only with evidence that it is not on a kiosk
// surface, and say why in the PR.
const ALLOWLIST = new Set([]);

const KNOWN_EXTENSIONS = new Set([".vue", ".css", ".js", ".jsx", ".ts"]);

const walk = dir => {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (KNOWN_EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) {
      files.push(full);
    }
  }
  return files;
};

const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, "");

const EXPENSIVE = [
  { name: "backdrop-filter", pattern: /backdrop-filter\s*:/g },
  // A prefixed blur is still a blur.
  { name: "filter: blur(", pattern: /(?:-webkit-)?filter\s*:[^;{}]*\bblur\s*\(/g },
];

const FULL_GATE = /\[data-effects\s*=\s*["']full["']\]/;

/** The bodies of every rule whose selector is gated by [data-effects="full"]. */
const fullGatedRanges = source => {
  const ranges = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!FULL_GATE.test(match[1].replace(/\s+/g, " "))) continue;
    const start = match.index + match[0].indexOf("{") + 1;
    ranges.push([start, match.index + match[0].length]);
  }
  return ranges;
};

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

describe("no full-surface CSS blur", () => {
  it('finds no backdrop-filter or filter: blur outside [data-effects="full"]', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      if (ALLOWLIST.has(rel)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      const gated = fullGatedRanges(source);
      for (const { name, pattern } of EXPENSIVE) {
        for (const match of source.matchAll(pattern)) {
          const index = match.index ?? 0;
          const allowed = gated.some(([start, end]) => index >= start && index < end);
          if (allowed) continue;
          offenders.push(`${rel}:${lineOf(source, index)} — ${name}`);
        }
      }
    }

    expect(offenders, `Remove or gate these CSS blurs:\n${offenders.join("\n")}`).toEqual([]);
  });
});
