/**
 * Unit tests for MinimalUIOverlay — the configurable hot-corner reveal shown
 * when the UI is hidden (calvin-hgy).
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
    expect(btn.attributes("title")).toBe("Show controls");
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

  it("does not render when the corner is switched off", () => {
    configStore.hotCornerPosition = "off";
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").exists()).toBe(false);
  });

  it("applies the configured rest opacity (0–100 → 0–1)", () => {
    configStore.hotCornerOpacity = 20;
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").attributes("style")).toContain("--rest-opacity: 0.2");
  });

  it("reveals the UI temporarily on tap", async () => {
    const spy = vi.spyOn(configStore, "showUITemporarily");
    const wrapper = mount(MinimalUIOverlay);
    await wrapper.find(".hot-corner").trigger("click");
    expect(spy).toHaveBeenCalledWith(60);
  });
});
