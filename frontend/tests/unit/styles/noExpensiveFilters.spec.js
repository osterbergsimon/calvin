/**
 * A Raspberry Pi kiosk (cog / WPE WebKit) cannot afford a full-screen or
 * full-region CSS backdrop blur: every frame of a fade-in, or every photo
 * change, re-runs the blur over the whole surface. The dashboard therefore
 * uses solid or translucent colour instead. The allowlist stays empty on
 * purpose — a new exception must be a reviewed decision, not an accident.
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
  { name: "backdrop-filter", pattern: /backdrop-filter\s*:/ },
  // A prefixed blur is still a blur.
  { name: "filter: blur(", pattern: /(?:-webkit-)?filter\s*:[^;{}]*\bblur\s*\(/ },
];

describe("no full-surface CSS blur", () => {
  it("finds no backdrop-filter or filter: blur in frontend/src", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split("\\").join("/");
      if (ALLOWLIST.has(rel)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        for (const { name, pattern } of EXPENSIVE) {
          if (pattern.test(line)) {
            offenders.push(`${rel}:${index + 1} — ${name}`);
          }
        }
      });
    }

    expect(offenders, `Remove or replace these CSS blurs:\n${offenders.join("\n")}`).toEqual([]);
  });
});
