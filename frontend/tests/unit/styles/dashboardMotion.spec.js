/**
 * Dashboard motion on the Pi kiosk: only opacity and transform may animate.
 * Animating box-shadow, filter, width/height or an offset repaints (or lays
 * out) a whole region every frame.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = path => readFileSync(resolve(__dirname, "../../../src", path), "utf8");
const styleOf = file => {
  const source = read(file);
  const style = source.slice(source.indexOf("<style"), source.indexOf("</style>"));
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
};

const transitionProps = (style, selector) => {
  const match = style.match(new RegExp(`${selector}\\s*\\{[^}]*transition:\\s*([^;]+);`, "s"));
  return match ? match[1] : "";
};

describe("dashboard motion stays on the compositor", () => {
  it("the region focus frame transitions only transform and opacity", () => {
    const style = styleOf("components/ui/FocusPanel.vue");
    const props = transitionProps(style, "\\.focus-panel");
    expect(props).toMatch(/transform/);
    expect(props).toMatch(/opacity/);
    expect(props).not.toMatch(/box-shadow/);
    expect(props).not.toMatch(/filter/);
  });

  it("the status lamp keyframes animate opacity, never filter", () => {
    const style = styleOf("components/StatusRail.vue");
    const keyframes = style.slice(style.indexOf("@keyframes lamp-arrive"));
    const end = keyframes.indexOf(".tile-enter-active");
    // lamp-arrive, lamp-alert and timer-deplete; the timer uses transform.
    expect(keyframes.slice(0, end)).not.toMatch(/filter\s*:/);
  });
});
