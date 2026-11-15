/**
 * The bar's part markup lives in ClockBarPart.vue, so its typography must live
 * there too. The styles used to sit in ClockBarHorizontal/Vertical's scoped
 * blocks, which never reached the elements the part renders, so the live bar
 * lost the time/date/room faces and the stacked-digit layout.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
const read = path => readFileSync(resolve(SRC, path), "utf8");

const styleBlock = path => read(path).split("<style")[1] || "";

const rule = (style, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = style.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : "";
};

describe("clock bar part styles", () => {
  const partStyle = styleBlock("components/ClockBarPart.vue");

  it.each([
    [".clock-time", /font-family:\s*var\(--font-display\)/],
    [".clock-date", /font-family:\s*var\(--font-data\)/],
    [".clock-bar-room", /font-family:\s*var\(--font-ui\)/],
    [".compact-time", /flex-direction:\s*column/],
    [".compact-date-stacked", /writing-mode:\s*horizontal-tb/],
    [".compact-date", /writing-mode:\s*vertical-rl/],
  ])("defines %s in ClockBarPart.vue", (selector, expected) => {
    expect(rule(partStyle, selector)).toMatch(expected);
  });
});
