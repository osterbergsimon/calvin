/**
 * Unit tests for MinimalUIOverlay — the configurable hot-corner reveal hint
 * shown when the UI is hidden. The reveal gesture itself (press-and-hold) lives
 * in useHotCornerReveal; here we test the visual (calvin-hgy, calvin-arv).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import MinimalUIOverlay from "@/components/MinimalUIOverlay.vue";
import { useConfigStore } from "@/stores/config";

describe("MinimalUIOverlay (hot corner)", () => {
  let configStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    configStore = useConfigStore();
    configStore.showUI = false;
  });

  it("renders the hot corner in the configured position when the UI is hidden", () => {
    configStore.hotCornerPosition = "top-right";
    const wrapper = mount(MinimalUIOverlay);
    const btn = wrapper.find(".hot-corner");
    expect(btn.exists()).toBe(true);
    expect(btn.classes()).toContain("hot-corner--top-right");
    expect(wrapper.find("svg").exists()).toBe(true);
  });

  it("defaults to bottom-left", () => {
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").classes()).toContain("hot-corner--bottom-left");
  });

  it("does not render when the UI is shown", () => {
    configStore.showUI = true;
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").exists()).toBe(false);
  });

  it("normalizes a legacy 'off' value to bottom-left (no lockout)", () => {
    configStore.hotCornerPosition = "off";
    const wrapper = mount(MinimalUIOverlay);
    const btn = wrapper.find(".hot-corner");
    expect(btn.exists()).toBe(true);
    expect(btn.classes()).toContain("hot-corner--bottom-left");
  });

  it("applies the configured rest opacity (0–100 → 0–1)", () => {
    configStore.hotCornerOpacity = 20;
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").attributes("style")).toContain("--rest-opacity: 0.2");
  });

  it("applies the configured size", () => {
    configStore.hotCornerSize = 80;
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").attributes("style")).toContain("--hot-corner-size: 80px");
  });

  it("reveals the UI temporarily via keyboard activation (Enter → click)", async () => {
    const spy = vi.spyOn(configStore, "showUITemporarily");
    const wrapper = mount(MinimalUIOverlay);
    await wrapper.find(".hot-corner").trigger("click");
    expect(spy).toHaveBeenCalledWith(60);
  });
});
