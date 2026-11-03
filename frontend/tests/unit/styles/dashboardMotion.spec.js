/**
 * Dashboard motion on the Pi kiosk: only opacity and transform may animate.
 * Animating box-shadow, filter, width/height or an offset repaints (or lays
 * out) a whole region every frame.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { styleRules } from "./lint-helpers.js";

const read = path => readFileSync(resolve(__dirname, "../../../src", path), "utf8");
const styleOf = file => {
  const source = read(file);
  const style = source.slice(source.indexOf("<style"), source.indexOf("</style>"));
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
};

const isFullStyle = selector =>
  selector.includes('[data-effects="full"]') || selector.includes("[data-effects='full']");

describe("dashboard motion stays on the compositor", () => {
  it("the standard focus frame does not animate at all (calvin-fufd)", () => {
    // Measured on the Pi 3B+: the 2px lift and its 0.2s transitions were about
    // half of a region swap's cost. The ring and glow just snap.
    const rules = styleRules("components/ui/FocusPanel.vue");
    const transitions = rules.filter(rule =>
      rule.declarations.some(declaration => declaration.prop === "transition")
    );
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.filter(rule => !isFullStyle(rule.selector)).map(r => r.selector)).toEqual(
      []
    );
  });

  it('allows the original focus-frame motion only under [data-effects="full"]', () => {
    const style = styleOf("components/ui/FocusPanel.vue");
    const full = style.match(
      /\[data-effects="full"\]\s+\.focus-panel\s*\{[^}]*transition:\s*([^;]+);/s
    );
    expect(full?.[1]).toMatch(/transform/);
  });

  it("the status lamp keyframes animate opacity, never filter", () => {
    const style = styleOf("components/StatusRail.vue");
    const keyframes = style.slice(style.indexOf("@keyframes lamp-arrive"));
    const end = keyframes.indexOf(".tile-enter-active");
    // lamp-arrive, lamp-alert and timer-deplete; the timer uses transform.
    expect(keyframes.slice(0, end)).not.toMatch(/filter\s*:/);
  });
});
