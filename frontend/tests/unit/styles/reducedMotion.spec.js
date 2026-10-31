/**
 * Reduced-motion contract (CLV-65).
 *
 * One global rule in base.css neutralises every transition/animation when the
 * device asks for reduced motion; components must not have to remember to opt
 * in. The end-to-end motion audit verifies the rule reaches the real screens.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseCss = readFileSync(resolve(__dirname, "../../../src/styles/base.css"), "utf-8");

const reducedMotionBlock = baseCss.match(
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/
)?.[1];

describe("prefers-reduced-motion", () => {
  it("neutralises transitions and animations globally", () => {
    expect(reducedMotionBlock, "base.css must carry a global reduced-motion rule").toBeTruthy();
    expect(reducedMotionBlock).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(reducedMotionBlock).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(reducedMotionBlock).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  it("covers pseudo-elements and disables smooth scrolling", () => {
    expect(reducedMotionBlock).toContain("*::before");
    expect(reducedMotionBlock).toContain("*::after");
    expect(reducedMotionBlock).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});
