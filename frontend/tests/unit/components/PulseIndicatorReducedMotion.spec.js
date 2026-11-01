/**
 * CLV-115: Pulse is the style forced under reduced motion, and the settings
 * copy promises "so it pulses". The global reduced-motion rule (base.css)
 * stops every animation with !important, so the Pulse must exempt its own
 * slow, low-opacity fade from that rule or it renders as a steady line.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = path => readFileSync(resolve(__dirname, "../../../src", path), "utf-8");
const PULSE = read("components/indicators/PulseIndicator.vue");
const STYLE = PULSE.slice(PULSE.indexOf("<style"), PULSE.indexOf("</style>"));
const BASE = read("styles/base.css");

const reducedMotionBlock = css => {
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
};

describe("Pulse still pulses under reduced motion (CLV-115)", () => {
  it("the global rule it must override stops animations with !important", () => {
    const global = reducedMotionBlock(BASE);
    expect(global).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(global).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
  });

  it("re-asserts its breathing inside a reduced-motion block, with !important", () => {
    const own = reducedMotionBlock(STYLE);
    expect(own).toMatch(/\.pulse__ring\s*\{/);
    expect(own).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
    expect(own).toMatch(/animation-duration:\s*calc\(var\(--dur\)\s*\*\s*12\)\s*!important/);
  });

  it("the fade it keeps is the low-opacity one, not a travelling light", () => {
    expect(STYLE).toMatch(/@keyframes pulse-breathe\s*\{\s*50%\s*\{\s*opacity:\s*0\.12;/);
    expect(STYLE).not.toMatch(/transform|offset-path/);
  });
});
