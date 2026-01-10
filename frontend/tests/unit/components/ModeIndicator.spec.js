/**
 * Unit tests for ModeIndicator component
 * Tests functionality: displays current mode correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ModeIndicator from "@/components/ModeIndicator.vue";
import { useModeStore } from "@/stores/mode";
import { useConfigStore } from "@/stores/config";

describe("ModeIndicator", () => {
  let modeStore;
  let configStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();

    modeStore = useModeStore();
    configStore = useConfigStore();

    // Reset to default state
    modeStore.currentMode = modeStore.MODES.CALENDAR;
    modeStore.isFullscreen = false;
    modeStore.fullscreenMode = null;
    configStore.showModeIndicator = true;
    configStore.modeIndicatorTimeout = 5;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Visibility", () => {
    it("should be hidden when showModeIndicator is disabled", async () => {
      configStore.showModeIndicator = false;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".mode-indicator").classes()).toContain("hidden");
    });

    it("should be visible when showModeIndicator is enabled", async () => {
      configStore.showModeIndicator = true;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      // Should be visible initially (immediate watch triggers showIndicator)
      expect(wrapper.find(".mode-indicator").classes()).not.toContain("hidden");
    });

    it("should hide after timeout when configured", async () => {
      configStore.showModeIndicator = true;
      configStore.modeIndicatorTimeout = 2; // 2 seconds

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      // Initially visible
      expect(wrapper.find(".mode-indicator").classes()).not.toContain("hidden");

      // Fast-forward past timeout
      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();

      // Should be hidden after timeout
      expect(wrapper.find(".mode-indicator").classes()).toContain("hidden");
    });

    it("should remain visible when timeout is 0", async () => {
      configStore.showModeIndicator = true;
      configStore.modeIndicatorTimeout = 0;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      // Fast-forward time
      vi.advanceTimersByTime(10000);
      await wrapper.vm.$nextTick();

      // Should still be visible (no timeout)
      expect(wrapper.find(".mode-indicator").classes()).not.toContain("hidden");
    });
  });

  describe("Mode Display", () => {
    it("should display calendar mode icon", async () => {
      modeStore.currentMode = modeStore.MODES.CALENDAR;
      modeStore.isFullscreen = false;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("📅");
      expect(wrapper.find(".mode-icon").attributes("title")).toBe(
        "Calendar Mode",
      );
      expect(wrapper.find(".mode-icon").classes()).toContain("mode-calendar");
    });

    it("should display photos mode icon", async () => {
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      modeStore.isFullscreen = false;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("📷");
      expect(wrapper.find(".mode-icon").attributes("title")).toBe(
        "Photos Mode",
      );
      expect(wrapper.find(".mode-icon").classes()).toContain("mode-photos");
    });

    it("should display web services mode icon", async () => {
      modeStore.currentMode = modeStore.MODES.WEB_SERVICES;
      modeStore.isFullscreen = false;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("🌐");
      expect(wrapper.find(".mode-icon").attributes("title")).toBe(
        "Web Services Mode",
      );
      expect(wrapper.find(".mode-icon").classes()).toContain(
        "mode-web_services",
      );
    });

    it("should display fullscreen photos icon when in fullscreen photos", async () => {
      modeStore.isFullscreen = true;
      modeStore.fullscreenMode = modeStore.MODES.PHOTOS;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("📷");
      expect(wrapper.find(".mode-icon").attributes("title")).toBe(
        "Fullscreen Photos",
      );
      expect(wrapper.find(".mode-icon").classes()).toContain("mode-photos");
    });

    it("should display fullscreen web services icon when in fullscreen web services", async () => {
      modeStore.isFullscreen = true;
      modeStore.fullscreenMode = modeStore.MODES.WEB_SERVICES;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("🌐");
      expect(wrapper.find(".mode-icon").attributes("title")).toBe(
        "Fullscreen Web Services",
      );
      expect(wrapper.find(".mode-icon").classes()).toContain(
        "mode-web_services",
      );
    });
  });

  describe("Mode Changes", () => {
    it("should update icon when mode changes", async () => {
      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("📅");

      // Change mode
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".icon-text").text()).toBe("📷");
    });

    it("should show indicator when mode changes", async () => {
      configStore.modeIndicatorTimeout = 2;

      const wrapper = mount(ModeIndicator);
      await wrapper.vm.$nextTick();

      // Fast-forward past initial timeout
      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();

      // Should be hidden
      expect(wrapper.find(".mode-indicator").classes()).toContain("hidden");

      // Change mode
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      // Should be visible again
      expect(wrapper.find(".mode-indicator").classes()).not.toContain("hidden");
    });
  });
});
