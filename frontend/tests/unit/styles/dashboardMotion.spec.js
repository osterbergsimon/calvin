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

  it("the standard status lamp keyframes animate opacity, never filter", () => {
    const style = styleOf("components/StatusRail.vue");
    const standard = style.slice(
      style.indexOf("@keyframes lamp-arrive"),
      style.indexOf("@keyframes lamp-arrive-full")
    );
    expect(standard).toMatch(/@keyframes lamp-alert/);
    expect(standard).not.toMatch(/filter\s*:/);
  });

  it('restores the lamp brightness flash only under [data-effects="full"]', () => {
    const style = styleOf("components/StatusRail.vue");
    const fullKeyframes = style.slice(
      style.indexOf("@keyframes lamp-arrive-full"),
      style.indexOf("@keyframes timer-deplete")
    );
    expect(fullKeyframes).toMatch(/filter:\s*brightness\(2\.2\)/);
    expect(fullKeyframes).toMatch(/filter:\s*brightness\(2\.4\)/);

    const rules = styleRules("components/StatusRail.vue");
    const animationNames = rules
      .filter(rule => !isFullStyle(rule.selector))
      .flatMap(rule =>
        rule.declarations
          .filter(declaration => declaration.prop === "animation-name")
          .map(declaration => declaration.value)
      );
    expect(animationNames).not.toContain("lamp-arrive-full");
    expect(animationNames).not.toContain("lamp-alert-full");
  });

  it('restores the event item all-property transition only under [data-effects="full"]', () => {
    const rules = styleRules("components/CalendarEventItem.vue");
    const valueOf = rule => rule.declarations.find(d => d.prop === "transition").value;
    const transitions = rules.filter(rule =>
      rule.declarations.some(declaration => declaration.prop === "transition")
    );
    const standard = transitions
      .filter(rule => !isFullStyle(rule.selector))
      .map(valueOf)
      .join(" ");
    const full = transitions
      .filter(rule => isFullStyle(rule.selector))
      .map(valueOf)
      .join(" ");
    // Standard keeps the compositor-only hover lift; Full restores the
    // border/shadow fades from before the audit.
    expect(standard).toMatch(/opacity/);
    expect(standard).toMatch(/transform/);
    expect(standard).not.toMatch(/\ball\b/);
    expect(full).toMatch(/\ball\b/);
  });

  it('restores the ribbon shadow transition only under [data-effects="full"]', () => {
    const rules = styleRules("components/CalendarRibbon.vue");
    const valueOf = rule => rule.declarations.find(d => d.prop === "transition").value;
    const transitions = rules.filter(rule =>
      rule.declarations.some(declaration => declaration.prop === "transition")
    );
    const standard = transitions
      .filter(rule => !isFullStyle(rule.selector))
      .map(valueOf)
      .join(" ");
    const full = transitions
      .filter(rule => isFullStyle(rule.selector))
      .map(valueOf)
      .join(" ");
    expect(standard).not.toMatch(/box-shadow/);
    expect(full).toMatch(/box-shadow/);
  });
});
