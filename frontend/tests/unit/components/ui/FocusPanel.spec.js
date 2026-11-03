import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FocusPanel from "@/components/ui/FocusPanel.vue";

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
});
