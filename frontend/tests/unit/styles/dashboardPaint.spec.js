/**
 * Dashboard paint budget (calvin-c3jz, kiosk performance fixes #2 and #8).
 *
 * A Raspberry Pi 3B+ kiosk re-rasterises a whole region whenever its paint
 * properties change. Two effects dominated the measured tap and page-switch
 * cost: a four-layer `box-shadow` glow (up to 68 px blur) on the focused region,
 * `filter: saturate() brightness()` on every dimmed region, and 22 animated
 * comet beads painting three shadow layers each.
 *
 * The budget below is deliberately simple:
 * - no element stacks more than two `box-shadow` layers;
 * - no dashboard paint surface animates a CSS filter (dimming is a translucent
 *   overlay whose opacity can be composited).
 *
 * jsdom does not apply stylesheets, so this pins the source the same way
 * `dashboardMotion.spec.js` does; the profiler measures the real browser.
 */
import { describe, expect, it } from "vitest";
import { styleRules } from "./lint-helpers.js";

// The dashboard's animated / focus-light surfaces. Settings-only styles are out
// of scope for this guard.
const DASHBOARD_PAINT_FILES = [
  "components/ui/FocusPanel.vue",
  "components/DashboardPanel.vue",
  "components/DashboardRegion.vue",
  "components/LoadingLight.vue",
  "components/indicators/CometIndicator.vue",
  "components/indicators/PulseIndicator.vue",
  "views/Dashboard.vue",
];

/** Split a CSS value on top-level commas, ignoring those inside var()/color-mix(). */
const valueLayers = value => {
  const layers = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  layers.push(current.trim());
  return layers.filter(Boolean);
};

// The opt-in "full" focus light (calvin-fufd) restores the original glow for
// fast kiosks. It only applies with .is-full, so the budget below covers the
// default performance style and leaves those rules alone.
const isFullStyle = rule => rule.selector.includes(".is-full");

const declarationsOf = (file, prop) =>
  styleRules(file)
    .filter(rule => !isFullStyle(rule))
    .flatMap(rule => rule.declarations.map(declaration => ({ rule, ...declaration })))
    .filter(declaration => declaration.prop === prop);

describe("dashboard paint budget (calvin-c3jz)", () => {
  it("no element stacks more than two box-shadow layers", () => {
    const offenders = [];
    for (const file of DASHBOARD_PAINT_FILES) {
      for (const { rule, value } of declarationsOf(file, "box-shadow")) {
        if (value === "none") continue;
        const layers = valueLayers(value);
        if (layers.length > 2) {
          offenders.push(`${file} ${rule.selector}: ${layers.length} layers — ${value}`);
        }
      }
    }
    expect(offenders, `Cheapen these shadow stacks:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps the focused region to a ring plus at most one small shadow", () => {
    const shadows = declarationsOf("components/ui/FocusPanel.vue", "box-shadow");
    const focused = shadows.find(({ rule }) => rule.selector === ".focus-panel.is-focused");
    // One layer: a ring via outline/border is preferred over a shadow stack.
    expect(valueLayers(focused?.value || "")).toHaveLength(1);
  });

  it("does not lift the focused region in the performance style", () => {
    const focused = styleRules("components/ui/FocusPanel.vue").find(
      rule => rule.selector === ".focus-panel.is-focused"
    );
    const transform = focused.declarations.find(d => d.prop === "transform");
    expect(transform?.value ?? "none").toBe("none");
  });

  it("keeps the original glow and dim available as the full style", () => {
    const rules = styleRules("components/ui/FocusPanel.vue").filter(isFullStyle);
    const focused = rules.find(rule => rule.selector.includes(".is-focused"));
    const shadow = focused?.declarations.find(d => d.prop === "box-shadow")?.value || "";
    expect(valueLayers(shadow)).toHaveLength(4);
    expect(focused.declarations.find(d => d.prop === "transform")?.value).toBe("translateY(-2px)");
    const dim = rules.find(
      rule => rule.selector.includes(".is-dim") && !rule.selector.includes("::after")
    );
    expect(dim?.declarations.find(d => d.prop === "filter")?.value).toMatch(/saturate/);
  });

  it("dims regions with an opacity overlay, never a filter", () => {
    const rules = styleRules("components/ui/FocusPanel.vue").filter(rule => !isFullStyle(rule));
    const dim = rules.filter(rule => rule.selector.includes(".is-dim"));

    expect(dim.some(rule => rule.declarations.some(d => d.prop === "filter"))).toBe(false);

    const overlay = rules.find(rule => rule.selector.includes("::after"));
    expect(overlay, "a translucent dim overlay pseudo-element").toBeTruthy();
    expect(overlay.declarations.find(d => d.prop === "background")?.value).toMatch(/var\(--/);
  });

  it("no dashboard paint surface declares a filter", () => {
    const offenders = [];
    for (const file of DASHBOARD_PAINT_FILES) {
      for (const { rule, value } of declarationsOf(file, "filter")) {
        if (value === "none") continue;
        offenders.push(`${file} ${rule.selector}: filter: ${value}`);
      }
    }
    expect(offenders, `Remove these filters:\n${offenders.join("\n")}`).toEqual([]);
  });
});
