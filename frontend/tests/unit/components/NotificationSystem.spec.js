/**
 * Unit tests for NotificationSystem — the input-echo HUD.
 * Covers keypress feedback and mode-change echo. System-event toasts live on
 * the StatusRail (see notifications store) and are tested separately.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import NotificationSystem from "@/components/NotificationSystem.vue";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";

vi.mock("axios");

describe("NotificationSystem (input-echo HUD)", () => {
  let configStore;
  let modeStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();

    configStore = useConfigStore();
    modeStore = useModeStore();

    configStore.keyboardFeedbackEnabled = true;
    configStore.keyboardFeedbackMode = "normal";
    configStore.modeIndicatorTimeout = 5;
    configStore.showUI = false;
    // Default to a booted app; the boot-hydration suite overrides this.
    configStore.hydrated = true;
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
      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("should render a keycap + label when shown", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "S", "Settings");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
      expect(wrapper.find(".hud__keycap").text()).toBe("S");
      expect(wrapper.find(".hud__label").text()).toBe("Settings");
    });

    it("should hide after the default keypress timeout (1500ms)", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "S", "Settings");
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(true);

      vi.advanceTimersByTime(1500);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("should hide after a custom timeout", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "S", "Settings", 2000);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(true);

      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);
    });
  });

  describe("Keyboard Feedback", () => {
    it("should show keyboard feedback when enabled", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_1", "screen_jump_calendar");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
      expect(wrapper.find(".hud__keycap").text()).toBe("1");
      expect(wrapper.find(".hud__label").text()).toBe("Calendar Screen");
    });

    it("should not show keyboard feedback when disabled", async () => {
      configStore.keyboardFeedbackEnabled = false;
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_1", "screen_jump_calendar");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("should map key codes to labels correctly", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_SPACE", "generic_next");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud__keycap").text()).toBe("Space");
      expect(wrapper.find(".hud__label").text()).toBe("Next");
    });

    it("should map action names to labels correctly", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.showKeyboardFeedback("KEY_2", "images_next");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud__label").text()).toBe("Next Image");
    });
  });

  describe("Mode Change Echo", () => {
    it("should show mode change (as a glyph) when UI is hidden", async () => {
      configStore.showUI = false;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      modeStore.currentMode = modeStore.MODES.WEB_SERVICES;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
      expect(wrapper.find(".hud__glyph").exists()).toBe(true);
      expect(wrapper.find(".hud__label").text()).toBe("Web Services Mode");
    });

    it("should not show mode change when UI is visible", async () => {
      configStore.showUI = true;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("should show fullscreen mode correctly", async () => {
      configStore.showUI = false;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      modeStore.isFullscreen = true;
      modeStore.fullscreenMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
      expect(wrapper.find(".hud__glyph").exists()).toBe(true);
      expect(wrapper.find(".hud__label").text()).toBe("Fullscreen Photos");
    });
  });

  describe("Size and Position", () => {
    it("should use the compact bottom variant in small mode", async () => {
      configStore.keyboardFeedbackMode = "small";
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "1", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").classes()).toContain("hud--small");
      expect(wrapper.find(".hud").classes()).toContain("hud--bottom");
    });

    it("should centre in normal mode", async () => {
      configStore.keyboardFeedbackMode = "normal";
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "1", "Test");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").classes()).toContain("hud--center");
    });
  });

  describe("Config Changes", () => {
    it("should hide when keyboard feedback is disabled", async () => {
      const wrapper = mount(NotificationSystem);

      wrapper.vm.show("keyboard", "1", "Test");
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(true);

      configStore.keyboardFeedbackEnabled = false;
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("should show mode indicator when UI becomes hidden", async () => {
      configStore.showUI = true;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);

      configStore.showUI = false;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
    });

    it("should hide mode indicator when UI becomes visible", async () => {
      configStore.showUI = false;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      modeStore.currentMode = modeStore.MODES.PHOTOS;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(true);

      configStore.showUI = true;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);
    });
  });

  describe("Boot-time hydration (calvin-2ck)", () => {
    it("does not flash the mode HUD when the initial config load hides the UI", async () => {
      // Boot state: showUI sits at its default (true) and the app has not yet
      // hydrated its persisted config. The mode HUD component is already mounted.
      configStore.showUI = true;
      configStore.hydrated = false;
      modeStore.currentMode = modeStore.MODES.CALENDAR;

      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".hud").exists()).toBe(false);

      // The initial config load resolves with a kiosk config (showUI:false).
      // That true->false settle must NOT be echoed as a user mode change —
      // otherwise a stale "Calendar Mode" HUD flashes on every reload.
      axios.get.mockResolvedValue({ data: { showUI: false } });
      await configStore.fetchConfig();
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(false);
    });

    it("still echoes a genuine UI-hide toggle once hydrated", async () => {
      configStore.hydrated = true;
      configStore.showUI = true;
      const wrapper = mount(NotificationSystem);
      await wrapper.vm.$nextTick();

      // User hides the chrome after boot — this SHOULD flash the mode HUD.
      configStore.showUI = false;
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(100);
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".hud").exists()).toBe(true);
    });
  });

  describe("Exposed Methods", () => {
    it("should expose show / showKeyboardFeedback / showModeChange", () => {
      const wrapper = mount(NotificationSystem);
      expect(typeof wrapper.vm.show).toBe("function");
      expect(typeof wrapper.vm.showKeyboardFeedback).toBe("function");
      expect(typeof wrapper.vm.showModeChange).toBe("function");
    });
  });
});
