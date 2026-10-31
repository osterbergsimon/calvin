/**
 * Narrow-layout regressions (CLV-91 / CLV-93).
 *
 * jsdom cannot evaluate media queries or lay out flex rows, so these tests pin
 * the rules that do the work: the phone clock bar drops its screen dots, a
 * narrow calendar header wraps so the month title survives, and the phone
 * Settings top bar shows only the save dot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
const read = path => readFileSync(resolve(SRC, path), "utf8");

const styleOf = file => {
  const match = read(file).match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1].replace(/\/\*[\s\S]*?\*\//g, "") : "";
};

/** Every declaration body for a rule whose selector is exactly `selector`. */
const rules = (css, selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].trim() === selector)
    .map(match => match[2]);

/** The declarations of a single rule (all matching rules joined), or "". */
const rule = (css, selector) => rules(css, selector).join("\n");

/** The body of one @media block, or "" when it does not exist. */
const mediaBlock = (css, query) => {
  const start = css.indexOf(`@media ${query}`);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
};

describe("clock bar at phone width", () => {
  const css = styleOf("components/ClockBarHorizontal.vue");
  const phone = mediaBlock(css, "(max-width: 600px)");

  it("uses the doctrine's phone breakpoint", () => {
    expect(phone).not.toBe("");
  });

  it("never lets the side groups squeeze the centred clock", () => {
    expect(rule(css, ".clock-bar-content")).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it("hides the screen dots so they cannot run under the time", () => {
    expect(rule(phone, ".clock-bar-horizontal .screen-dots")).toMatch(/display:\s*none/);
  });
});

describe("calendar header in a narrow region", () => {
  const css = styleOf("components/CalendarView.vue");

  it("wraps the header instead of clipping the controls at the right edge", () => {
    expect(rule(css, ".calendar-header")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("keeps the month title on the first line and truncates it", () => {
    const label = rule(css, ".calendar-header__label");
    expect(label).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("wraps the controls and right-aligns them when they move to their own row", () => {
    const controls = rule(css, ".calendar-header__controls");
    expect(controls).toMatch(/flex-wrap:\s*wrap/);
    expect(controls).toMatch(/margin-left:\s*auto/);
  });
});

describe("settings top bar at phone width", () => {
  const css = styleOf("components/settings/shell/SettingsTopBar.vue");
  const phone = mediaBlock(css, "(max-width: 600px)");

  it("uses the doctrine's phone breakpoint", () => {
    expect(phone).not.toBe("");
  });

  it("shows the save state as the dot only", () => {
    expect(rule(phone, ".settings-topbar__pill-label")).toMatch(/display:\s*none/);
  });
});
