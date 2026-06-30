/**
 * Unit tests for MinimalUIOverlay — the hot-corner reveal shown when the UI is
 * hidden (calvin-hgy).
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

  it("renders the hot corner when the UI is hidden", () => {
    const wrapper = mount(MinimalUIOverlay);
    const btn = wrapper.find(".hot-corner");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("title")).toBe("Show controls");
    expect(btn.attributes("aria-label")).toBe("Show controls");
    expect(wrapper.find("svg").exists()).toBe(true);
  });

  it("does not render when the UI is shown", () => {
    configStore.showUI = true;
    const wrapper = mount(MinimalUIOverlay);
    expect(wrapper.find(".hot-corner").exists()).toBe(false);
  });

  it("reveals the UI temporarily on tap", async () => {
    const spy = vi.spyOn(configStore, "showUITemporarily");
    const wrapper = mount(MinimalUIOverlay);
    await wrapper.find(".hot-corner").trigger("click");
    expect(spy).toHaveBeenCalledWith(60);
  });
});
