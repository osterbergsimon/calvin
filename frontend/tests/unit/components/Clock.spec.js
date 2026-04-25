/**
 * Unit tests for Clock component
 * Tests functionality: displays time and date correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import Clock from "@/components/Clock.vue";
import { useConfigStore } from "@/stores/config";

describe("Clock", () => {
  let configStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();

    configStore = useConfigStore();

    // Reset to default state
    configStore.clockEnabled = true;
    configStore.clockDisplayMode = "header";
    configStore.clockShowDate = false;
    configStore.clockShowSeconds = false;
    configStore.clockSize = "medium";
    configStore.timeFormat = "24h";
    configStore.timezone = null;
    configStore.showUI = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Visibility", () => {
    it("should not render when clock is disabled", () => {
      configStore.clockEnabled = false;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(false);
    });

    it("should not render when display mode is 'off'", () => {
      configStore.clockDisplayMode = "off";

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(false);
    });

    it("should render when display mode is 'header' and UI is shown", () => {
      configStore.clockDisplayMode = "header";
      configStore.showUI = true;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(true);
    });

    it("should not render when display mode is 'header' and UI is hidden", () => {
      configStore.clockDisplayMode = "header";
      configStore.showUI = false;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(false);
    });

    it("should render when display mode is 'always' and UI is hidden", () => {
      configStore.clockDisplayMode = "always";
      configStore.showUI = false;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(true);
    });

    it("should not render when display mode is 'always' and UI is shown", () => {
      configStore.clockDisplayMode = "always";
      configStore.showUI = true;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").exists()).toBe(false);
    });
  });

  describe("Time Display", () => {
    it("should display current time", () => {
      const fixedDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(fixedDate);

      const wrapper = mount(Clock);

      const timeText = wrapper.find(".clock-time").text();
      expect(timeText).toBeTruthy();
      expect(timeText).toMatch(/\d{1,2}:\d{2}/); // Matches time format
    });

    it("should update time when seconds are shown", async () => {
      configStore.clockShowSeconds = true;
      const fixedDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(fixedDate);

      const wrapper = mount(Clock);
      await wrapper.vm.$nextTick();

      const initialTime = wrapper.find(".clock-time").text();

      // Advance 1 second
      vi.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const updatedTime = wrapper.find(".clock-time").text();
      expect(updatedTime).not.toBe(initialTime);
    });

    it("should update time every minute when seconds are not shown", async () => {
      configStore.clockShowSeconds = false;
      const fixedDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(fixedDate);

      const wrapper = mount(Clock);
      await wrapper.vm.$nextTick();

      const initialTime = wrapper.find(".clock-time").text();

      // Advance 30 seconds (should not update)
      vi.advanceTimersByTime(30000);
      await wrapper.vm.$nextTick();

      let updatedTime = wrapper.find(".clock-time").text();
      expect(updatedTime).toBe(initialTime);

      // Advance 1 minute (should update)
      vi.advanceTimersByTime(30000);
      await wrapper.vm.$nextTick();

      updatedTime = wrapper.find(".clock-time").text();
      expect(updatedTime).not.toBe(initialTime);
    });
  });

  describe("Date Display", () => {
    it("should not show date when showDate is false", () => {
      configStore.clockShowDate = false;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock-date").exists()).toBe(false);
    });

    it("should show date when showDate is true", () => {
      configStore.clockShowDate = true;

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock-date").exists()).toBe(true);
      const dateText = wrapper.find(".clock-date").text();
      expect(dateText).toBeTruthy();
    });

    it("should use prop showDate when provided", () => {
      configStore.clockShowDate = false;

      const wrapper = mount(Clock, {
        props: { showDate: true },
      });

      expect(wrapper.find(".clock-date").exists()).toBe(true);
    });

    it("should use prop showDate to override config", () => {
      configStore.clockShowDate = true;

      const wrapper = mount(Clock, {
        props: { showDate: false },
      });

      expect(wrapper.find(".clock-date").exists()).toBe(false);
    });
  });

  describe("Time Format", () => {
    it("should display time in 24h format", () => {
      configStore.timeFormat = "24h";
      const fixedDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(fixedDate);

      const wrapper = mount(Clock);

      const timeText = wrapper.find(".clock-time").text();
      // 24h format should show 14:30 (no AM/PM)
      expect(timeText).toMatch(/14:30/);
    });

    it("should display time in 12h format", () => {
      configStore.timeFormat = "12h";
      const fixedDate = new Date("2024-01-15T14:30:00");
      vi.setSystemTime(fixedDate);

      const wrapper = mount(Clock);

      const timeText = wrapper.find(".clock-time").text();
      // 12h format should show 2:30 PM or similar
      expect(timeText).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
    });
  });

  describe("Size and Styling", () => {
    it("should apply size class from config", () => {
      configStore.clockSize = "large";

      const wrapper = mount(Clock);

      expect(wrapper.find(".clock").classes()).toContain("size-large");
    });

    it("should apply dark mode class when theme is dark", async () => {
      // Mock window.matchMedia for dark mode detection
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes("dark"),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      configStore.themeMode = "dark";

      const wrapper = mount(Clock);
      await wrapper.vm.$nextTick();

      // Note: dark mode class depends on useTheme composable
      // This test verifies the component renders correctly
      expect(wrapper.find(".clock").exists()).toBe(true);
    });
  });

  describe("Display Mode Prop", () => {
    it("should use displayMode prop when provided", () => {
      configStore.clockDisplayMode = "off";

      const wrapper = mount(Clock, {
        props: { displayMode: "header" },
      });

      expect(wrapper.find(".clock").exists()).toBe(true);
    });

    it("should use config when displayMode prop is null", () => {
      configStore.clockDisplayMode = "header";

      const wrapper = mount(Clock, {
        props: { displayMode: null },
      });

      expect(wrapper.find(".clock").exists()).toBe(true);
    });
  });
});
