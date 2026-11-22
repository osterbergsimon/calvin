import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import FocusPanel from "@/components/ui/FocusPanel.vue";

const STYLE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/FocusPanel.vue"),
  "utf-8"
);

describe("FocusPanel", () => {
  it("is lit when focused", () => {
    const w = mount(FocusPanel, { props: { focused: true }, slots: { default: "x" } });
    expect(w.classes()).toContain("is-focused");
    expect(w.classes()).not.toContain("is-dim");
    expect(w.attributes("aria-current")).toBe("true");
  });

  it("is dimmed when not focused", () => {
    const w = mount(FocusPanel, { props: { focused: false }, slots: { default: "x" } });
    expect(w.classes()).toContain("is-dim");
    expect(w.attributes("aria-current")).toBeUndefined();
  });

  it("renders the requested root tag and slot", () => {
    const w = mount(FocusPanel, { props: { as: "article" }, slots: { default: "<p>hi</p>" } });
    expect(w.element.tagName.toLowerCase()).toBe("article");
    expect(w.html()).toContain("<p>hi</p>");
  });

  it("is neutral (neither focused nor dim) when dim=false and not focused", () => {
    const wrapper = mount(FocusPanel, { props: { focused: false, dim: false } });
    const root = wrapper.find(".focus-panel");
    expect(root.classes()).not.toContain("is-focused");
    expect(root.classes()).not.toContain("is-dim");
  });

  it("dims by default when not focused (back-compat)", () => {
    const wrapper = mount(FocusPanel, { props: { focused: false } });
    expect(wrapper.find(".focus-panel").classes()).toContain("is-dim");
  });

  it("draws the full-effects focus edge with the focus ring token", () => {
    const rule = STYLE.match(
      /\[data-effects="full"\]\s*\.focus-panel\.is-focused\s*\{([\s\S]*?)\}/
    );
    expect(rule).toBeTruthy();
    const body = rule[1];
    // Outline is none in full effects, so the crisp 2px edge is the indicator.
    expect(body).toMatch(/outline:\s*none/);
    expect(body).toMatch(/0 0 0 2px var\(--focus-ring\)/);
    // The halo and the two blooms stay on the accent and its derived layers.
    expect(body).toMatch(/0 0 10px 0 var\(--focus\)/);
    expect(body).toMatch(/0 0 30px 1px var\(--focus-edge\)/);
    expect(body).toMatch(/0 0 68px 3px var\(--focus-glow\)/);
  });
});
