/** Tests for ClockBarVertical component. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import { useConfigStore } from "@/stores/config";

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("ClockBarVertical", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render when enabled and showInNonKiosk is true and UI is visible", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-bar-vertical").exists()).toBe(true);
  });

  it("should not render when enabled but showInNonKiosk is false and UI is visible", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: false,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-bar-vertical").exists()).toBe(false);
  });

  it("should render when enabled and showInKiosk is true and UI is hidden", () => {
    const store = useConfigStore();
    store.showUI = false;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: false,
        showInKiosk: true,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-bar-vertical").exists()).toBe(true);
  });

  it("should not render when disabled", () => {
    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: false,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-bar-vertical").exists()).toBe(false);
  });

  it("should apply correct position class", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "right",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-bar-vertical.position-right").exists()).toBe(true);
  });

  it("should display time and date on same line", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockShowDate = true;
    store.clockBarLayout = "single-line";

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    const content = wrapper.find(".clock-bar-content");
    expect(content.exists()).toBe(true);
    // Check that layout is single-line (time and date on same line)
    expect(content.classes()).toContain("layout-single-line");
    expect(wrapper.find(".clock-time").exists()).toBe(true);
    expect(wrapper.find(".clock-date").exists()).toBe(true);
  });

  it("should display time", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-time").exists()).toBe(true);
    expect(wrapper.find(".clock-time").text()).toMatch(/\d{1,2}:\d{2}/);
  });

  it("should display date when showDate is true", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockShowDate = true;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-date").exists()).toBe(true);
  });

  it("should not display date when showDate is false", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockShowDate = false;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    expect(wrapper.find(".clock-date").exists()).toBe(false);
  });

  it("should apply font size from config", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockBarFontSize = 18;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        plugins: [],
      },
    });

    const timeElement = wrapper.find(".clock-time");
    expect(timeElement.exists()).toBe(true);
    expect(timeElement.attributes("style")).toContain("font-size: 18px");
  });
});
