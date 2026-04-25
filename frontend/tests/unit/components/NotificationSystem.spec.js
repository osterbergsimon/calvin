/**
 * Unit tests for NotificationSystem component
 * Tests functionality: displays notifications, keyboard feedback, and mode changes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import NotificationSystem from "@/components/NotificationSystem.vue";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";

describe("NotificationSystem", () => {
  let configStore;
  let modeStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();

    configStore = useConfigStore();
    modeStore = useModeStore();

    // Reset to default state
    configStore.keyboardFeedbackEnabled = true;
    configStore.keyboardFeedbackMode = "normal";
    configStore.modeIndicatorTimeout = 5;
    configStore.showUI = false;
    modeStore.currentMode = modeStore.MODES.CALENDAR;
    modeStore.isFullscreen = false;
    modeStore.fullscreenMode = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Visibility", () => {
    it("should not render when not visible", () => {
      const wrapper = mount(NotificationSystem);

      expect(wrapper.find(".notification").exists()).toBe(false);
    });

    it("should render when shown via show method", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test message");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
      expect(wrapper.find(".notification-icon").text()).toBe("ℹ️");
      expect(wrapper.find(".notification-message").text()).toBe("Test message");
    });

    it("should hide after default timeout", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test message");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);

      // Fast-forward past default timeout (1500ms for info)
      vi.advanceTimersByTime(1500);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });

    it("should hide after custom timeout", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test message", 2000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);

      // Fast-forward past custom timeout
      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });
  });

  describe("Keyboard Feedback", () => {
    it("should show keyboard feedback when enabled", async () => {
      configStore.keyboardFeedbackEnabled = true;

      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_1", "mode_calendar");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
      expect(wrapper.find(".notification-icon").text()).toBe("1");
      expect(wrapper.find(".notification-message").text()).toBe("Calendar Mode");
    });

    it("should not show keyboard feedback when disabled", async () => {
      configStore.keyboardFeedbackEnabled = false;

      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_1", "mode_calendar");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });

    it("should map key codes to labels correctly", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_SPACE", "generic_next");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification-icon").text()).toBe("Space");
      expect(wrapper.find(".notification-message").text()).toBe("Next");
    });

    it("should map action names to labels correctly", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_2", "images_next");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification-message").text()).toBe("Next Image");
    });
  });

  describe("Mode Change Notifications", () => {
    it("should show mode change when UI is hidden", async () => {
      configStore.showUI = false;
      modeStore.currentMode = modeStore.MODES.CALENDAR;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // Trigger mode change via exposed method
      modeStore.currentMode = modeStore.MODES.WEB_SERVICES;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
      expect(wrapper.find(".notification-icon").text()).toBe("🌐");
      expect(wrapper.find(".notification-message").text()).toBe("Web Services Mode");
    });

    it("should not show mode change when UI is visible", async () => {
      configStore.showUI = true;
      modeStore.currentMode = modeStore.MODES.CALENDAR;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // Trigger mode change
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });

    it("should show fullscreen mode correctly", async () => {
      configStore.showUI = false;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // Set fullscreen mode
      modeStore.isFullscreen = true;
      modeStore.fullscreenMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
      expect(wrapper.find(".notification-icon").text()).toBe("📷");
      expect(wrapper.find(".notification-message").text()).toBe("Fullscreen Photos");
    });
  });

  describe("Notification Types and Styling", () => {
    it("should apply correct type class for mode notification", async () => {
      configStore.showUI = false;
      modeStore.currentMode = modeStore.MODES.CALENDAR;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // Trigger mode change to show notification
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").classes()).toContain("notification-photos");
    });

    it("should apply correct size class based on feedback mode", async () => {
      configStore.keyboardFeedbackMode = "small";

      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").classes()).toContain("notification-small");
    });

    it("should apply correct position class for small mode", async () => {
      configStore.keyboardFeedbackMode = "small";

      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").classes()).toContain(
        "notification-position-bottom-right"
      );
    });

    it("should apply center position for normal mode", async () => {
      configStore.keyboardFeedbackMode = "normal";

      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("info", "ℹ️", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").classes()).toContain("notification-position-center");
    });
  });

  describe("Config Changes", () => {
    it("should hide notification when keyboard feedback is disabled", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "1", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);

      // Disable keyboard feedback
      configStore.keyboardFeedbackEnabled = false;
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });

    it("should not hide success notifications when keyboard feedback is disabled", async () => {
      configStore.keyboardFeedbackEnabled = false;

      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("success", "✓", "System rebooting…", 5000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
      expect(wrapper.find(".notification-message").text()).toContain("rebooting");
    });

    it("should show mode indicator when UI becomes hidden", async () => {
      configStore.showUI = true;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);

      // Hide UI
      configStore.showUI = false;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(true);
    });

    it("should hide mode indicator when UI becomes visible", async () => {
      configStore.showUI = false;
      modeStore.currentMode = modeStore.MODES.CALENDAR;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // Trigger mode change to show notification
      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      // Should show mode indicator
      expect(wrapper.find(".notification").exists()).toBe(true);

      // Show UI
      configStore.showUI = true;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".notification").exists()).toBe(false);
    });
  });

  describe("Exposed Methods", () => {
    it("should expose show method", () => {
      const wrapper = mount(NotificationSystem);

      expect(typeof wrapper.vm.show).toBe("function");
    });

    it("should expose showKeyboardFeedback method", () => {
      const wrapper = mount(NotificationSystem);

      expect(typeof wrapper.vm.showKeyboardFeedback).toBe("function");
    });

    it("should expose showModeChange method", () => {
      const wrapper = mount(NotificationSystem);

      expect(typeof wrapper.vm.showModeChange).toBe("function");
    });
  });
});
