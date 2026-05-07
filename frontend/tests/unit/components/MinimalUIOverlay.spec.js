/**
 * Unit tests for MinimalUIOverlay component
 * Tests functionality: shows/hides UI toggle button based on UI visibility
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import MinimalUIOverlay from "@/components/MinimalUIOverlay.vue";
import { useConfigStore } from "@/stores/config";

describe("MinimalUIOverlay", () => {
  let configStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    configStore = useConfigStore();
    configStore.showUI = false;
  });

  describe("Visibility", () => {
    it("should render when UI is hidden", () => {
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").exists()).toBe(true);
      expect(wrapper.find(".ui-toggle-btn").exists()).toBe(true);
    });

    it("should not render when UI is shown", () => {
      configStore.showUI = true;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").exists()).toBe(false);
    });

    it("should be positioned in bottom-left", () => {
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").classes()).toContain("position-bottom-left");
    });
  });

  describe("Button Functionality", () => {
    it("should have correct button attributes", () => {
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      const button = wrapper.find(".ui-toggle-btn");
      expect(button.exists()).toBe(true);
      expect(button.attributes("title")).toBe("Show UI");
      expect(button.attributes("aria-label")).toBe("Show UI");
    });

    it("should call showUITemporarily when button is clicked", async () => {
      configStore.showUI = false;
      const showUITemporarilySpy = vi.spyOn(configStore, "showUITemporarily");

      const wrapper = mount(MinimalUIOverlay);

      const button = wrapper.find(".ui-toggle-btn");
      await button.trigger("click");

      expect(showUITemporarilySpy).toHaveBeenCalledWith(60);
    });

    it("should render SVG icon", () => {
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      const svg = wrapper.find("svg");
      expect(svg.exists()).toBe(true);
      expect(svg.attributes("width")).toBe("16");
      expect(svg.attributes("height")).toBe("16");
    });
  });
});
