/**
 * Fixed sets (docs/design/frontend-doctrine.md §2, audit 2026-10-31 P2).
 *
 * Four value families are a short closed set, with no allowlist:
 * - z-index: one of the layer roles (`--z-raised|sticky|dialog|popover|osk|toast`);
 * - font-weight: one of the weight roles (400 / 500 / 600 via `--weight-*`);
 * - transitions: `--dur-fast` (120ms) or `--dur` (200ms); animations derive
 *   from `--dur` too, never a literal time;
 * - width breakpoints: the shared custom media (`--bp-phone` 600px,
 *   `--bp-wide` 1024px), defined once in src/styles/breakpoints.js.
 * The global reduced-motion rule in base.css is the one place a literal time
 * may appear.
 */
import { describe, it, expect } from "vitest";
import {
  CSS_FILES,
  VUE_FILES,
  fixedSetViolations,
  fixedSetViolationsIn,
  formatViolation,
} from "./lint-helpers.js";

const FILES = [...VUE_FILES, ...CSS_FILES];

describe("fixed sets: z-index, weight, duration, breakpoints", () => {
  it("scans components and the global stylesheets", () => {
    expect(VUE_FILES.length).toBeGreaterThan(100);
    expect(CSS_FILES).toEqual(expect.arrayContaining(["styles/main.css", "styles/theme.css"]));
  });

  it("has no literal outside the fixed sets", () => {
    expect(FILES.flatMap(fixedSetViolations).map(formatViolation)).toEqual([]);
  });

  describe("rejects new literals", () => {
    const kinds = css => fixedSetViolationsIn("probe.vue", css).map(v => v.kind);

    it("z-index outside the layer roles", () => {
      expect(kinds(".a { z-index: 5; }")).toEqual(["z-index"]);
      expect(kinds(".a { z-index: calc(var(--z-dialog) + 1); }")).toEqual(["z-index"]);
      expect(kinds(".a { z-index: var(--z-modal); }")).toEqual(["z-index"]);
      expect(kinds(".a { z-index: var(--z-osk); } .b { z-index: auto; }")).toEqual([]);
    });

    it("font-weight outside the weight roles", () => {
      expect(kinds(".a { font-weight: 700; }")).toEqual(["font-weight"]);
      expect(kinds(".a { font-weight: bold; }")).toEqual(["font-weight"]);
      expect(kinds(".a { font: 600 1rem/1 sans-serif; }")).toEqual(["font-weight"]);
      expect(kinds(".a { font-weight: var(--weight-title); } .b { font-weight: inherit; }")).toEqual(
        []
      );
    });

    it("durations outside --dur-fast / --dur", () => {
      expect(kinds(".a { transition: opacity 0.2s ease; }")).toEqual(["duration"]);
      expect(kinds(".a { transition-duration: 150ms; }")).toEqual(["duration"]);
      expect(kinds(".a { transition: opacity calc(var(--dur) * 2); }")).toEqual(["duration"]);
      expect(kinds(".a { animation: spin 1s linear infinite; }")).toEqual(["duration"]);
      expect(
        kinds(
          ".a { transition: opacity var(--dur) var(--ease), color var(--dur-fast); }" +
            ".b { animation: spin calc(var(--dur) * 5) linear infinite; }"
        )
      ).toEqual([]);
    });

    it("leaves the reduced-motion override alone", () => {
      expect(
        kinds(
          "@media (prefers-reduced-motion: reduce) { .a { transition-duration: 0.001ms !important; } }"
        )
      ).toEqual([]);
    });

    it("width media queries outside the shared custom media", () => {
      expect(kinds("@media (max-width: 768px) { .a { color: red; } }")).toEqual(["breakpoint"]);
      expect(kinds("@media (min-width: 30rem) { .a { color: red; } }")).toEqual(["breakpoint"]);
      expect(kinds("@media (--bp-tablet) { .a { color: red; } }")).toEqual(["breakpoint"]);
      expect(
        kinds(
          "@media (--bp-phone), (orientation: portrait) { .a { color: red; } }" +
            "@media (orientation: portrait) and (max-height: 600px) { .b { color: red; } }"
        )
      ).toEqual([]);
    });
  });
});
