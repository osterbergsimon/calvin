/**
 * CLV-115: loading indicators and motion.
 *
 * - Pulse is the style forced under reduced motion, and the settings copy
 *   promises "so it pulses". The global reduced-motion rule (base.css) stops
 *   every animation with !important, so an *active* Pulse must exempt its own
 *   slow, low-opacity fade from that rule or it renders as a steady line.
 * - An idle indicator never animates: a kiosk idles for weeks, and an infinite
 *   animation at opacity 0 is compositor work for nothing (and, under reduced
 *   motion, breaks the CLV-65 contract in tests/e2e/a11y/motion.spec.js).
 *
 * jsdom does not apply stylesheets, so these pin the CSS source; the e2e
 * motion contract checks the computed styles in a real browser.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = path => readFileSync(resolve(__dirname, "../../../src", path), "utf-8");
const styleOf = sfc => sfc.slice(sfc.indexOf("<style"), sfc.indexOf("</style>"));
const PULSE_SFC = read("components/indicators/PulseIndicator.vue");
const PULSE = styleOf(PULSE_SFC);
const COMET = styleOf(read("components/indicators/CometIndicator.vue"));
const BASE = read("styles/base.css");

const block = (css, at) => {
  const start = css.indexOf(at);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
};
const reducedMotionBlock = css => block(css, "@media (prefers-reduced-motion: reduce)");

// Every rule (selector + body) at the top level of `css`, media blocks removed.
const topLevelRules = css => {
  const media = reducedMotionBlock(css);
  const flat = media ? css.replace(media, "") : css;
  return Array.from(flat.matchAll(/([^{}]+)\{([^{}]*)\}/g), m => ({
    selector: m[1].trim(),
    body: m[2],
  }));
};

describe("Pulse still pulses under reduced motion, but only while active (CLV-115)", () => {
  it("the global rule it must override stops animations with !important", () => {
    const global = reducedMotionBlock(BASE);
    expect(global).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(global).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
  });

  it("re-asserts its breathing for an active ring only, with !important", () => {
    const own = reducedMotionBlock(PULSE);
    const selectors = Array.from(own.matchAll(/([^{}]+)\{[^{}]*!important/g), m => m[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    // Gated on .is-active: an idle ring stays stopped by the global rule.
    for (const selector of selectors) {
      expect(selector).toMatch(/\.loading-indicator\.is-active\s+\.pulse__ring/);
    }
    expect(own).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
    expect(own).toMatch(/animation-duration:\s*calc\(var\(--dur\)\s*\*\s*12\)\s*!important/);
  });

  it("carries no blanket reduced-motion exemption marker", () => {
    expect(PULSE_SFC).not.toMatch(/data-reduced-motion-exempt/);
  });

  it("the fade it keeps is the low-opacity one, not a travelling light", () => {
    expect(PULSE).toMatch(/@keyframes pulse-breathe\s*\{\s*50%\s*\{\s*opacity:\s*0\.12;/);
    expect(PULSE).not.toMatch(/transform|offset-path/);
  });
});

describe("idle indicators do not animate (CLV-115)", () => {
  const pausedUnlessActive = (css, part) => {
    const rules = topLevelRules(css);
    const idle = rules.find(r => r.selector === `.loading-indicator ${part}`);
    const base = rules.find(r => r.selector === part);
    // The animation is paused by default...
    expect(`${base?.body}${idle?.body}`).toMatch(/animation-play-state:\s*paused/);
    // ...and runs only under .is-active.
    const running = rules.find(r => r.selector === `.loading-indicator.is-active ${part}`);
    expect(running?.body).toMatch(/animation-play-state:\s*running/);
  };

  it("Pulse ring is paused unless .is-active", () => pausedUnlessActive(PULSE, ".pulse__ring"));
  it("Comet beads are paused unless .is-active", () => pausedUnlessActive(COMET, ".comet__bead"));
});
