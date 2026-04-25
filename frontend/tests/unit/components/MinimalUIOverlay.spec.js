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

    // Reset to default state
    configStore.showUI = false;
    configStore.clockPosition = "top-right";
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
  });

  describe("Button Positioning", () => {
    it("should position button in bottom-left when clock is in top-right", () => {
      configStore.clockPosition = "top-right";
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").classes()).toContain("position-bottom-left");
    });

    it("should position button in bottom-right when clock is in top-left", () => {
      configStore.clockPosition = "top-left";
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").classes()).toContain("position-bottom-right");
    });

    it("should position button in top-left when clock is in bottom-right", () => {
      configStore.clockPosition = "bottom-right";
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").classes()).toContain("position-top-left");
    });

    it("should position button in top-right when clock is in bottom-left", () => {
      configStore.clockPosition = "bottom-left";
      configStore.showUI = false;

      const wrapper = mount(MinimalUIOverlay);

      expect(wrapper.find(".minimal-ui-overlay").classes()).toContain("position-top-right");
    });

    it("should default to bottom-left when clock position is invalid", () => {
      configStore.clockPosition = "invalid";
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
