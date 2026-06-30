/** Tests for ClockBarVertical component. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
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

  const globalMountOptions = {
    stubs: {
      BarActionCluster: true,
      PluginStatusbarItems: {
        props: ["orientation"],
        template:
          '<div class="plugin-statusbar-stub" :data-orientation="orientation || \'horizontal\'" />',
      },
    },
  };

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
        ...globalMountOptions,
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
        ...globalMountOptions,
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
        ...globalMountOptions,
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
        ...globalMountOptions,
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
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-vertical.position-right").exists()).toBe(true);
  });

  it("should display compact time and date for compact vertical layout", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockShowDate = true;
    store.clockBarVerticalLayout = "compact-time-date";

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    const content = wrapper.find(".clock-bar-content");
    expect(content.exists()).toBe(true);
    expect(content.classes()).toContain("layout-vertical-compact");
    expect(content.classes()).toContain("layout-compact-date");
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
        ...globalMountOptions,
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
        ...globalMountOptions,
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
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-date").exists()).toBe(false);
  });

  it("should apply font size from config", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockBarVerticalFontSize = 18;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    const timeElement = wrapper.find(".clock-time");
    expect(timeElement.exists()).toBe(true);
    expect(timeElement.attributes("style")).toContain("font-size: 18px");
  });

  it("should render statusbar items vertically when weather is enabled", async () => {
    const store = useConfigStore();
    store.showUI = true;
    store.clockBarShowWeather = false;

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".plugin-statusbar-stub").exists()).toBe(false);

    store.clockBarShowWeather = true;
    await nextTick();

    const statusbar = wrapper.find(".plugin-statusbar-stub");
    expect(statusbar.exists()).toBe(true);
    expect(statusbar.attributes("data-orientation")).toBe("vertical");
  });

  it("renders stacked screen dots for page navigation when there is more than one screen (calvin-rvd)", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.dashboardScreens = {
      version: 2,
      activeScreenId: "home",
      screens: [
        {
          id: "home",
          name: "Home",
          activeRegionId: "region-1",
          layout: {
            version: 1,
            preset: "single",
            regions: [{ id: "region-1", kind: "calendar", size: 100 }],
          },
        },
        {
          id: "media",
          name: "Media",
          activeRegionId: "region-1",
          layout: {
            version: 1,
            preset: "single",
            regions: [{ id: "region-1", kind: "photos", size: 100 }],
          },
        },
      ],
    };

    const wrapper = mount(ClockBarVertical, {
      props: { position: "left", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { ...globalMountOptions },
    });

    const dots = wrapper.findAll(".screen-dot");
    expect(dots).toHaveLength(2);
    expect(wrapper.find(".screen-dots--vertical").exists()).toBe(true);
    // the active screen's dot is marked current
    expect(wrapper.find('.screen-dot[aria-current="true"]').attributes("aria-label")).toBe(
      "Show screen: Home"
    );
  });

  it("does not render screen dots with a single screen", () => {
    const store = useConfigStore();
    store.showUI = true;
    store.dashboardScreens = {
      version: 2,
      activeScreenId: "home",
      screens: [
        {
          id: "home",
          name: "Home",
          activeRegionId: "region-1",
          layout: {
            version: 1,
            preset: "single",
            regions: [{ id: "region-1", kind: "calendar", size: 100 }],
          },
        },
      ],
    };

    const wrapper = mount(ClockBarVertical, {
      props: { position: "left", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { ...globalMountOptions },
    });

    expect(wrapper.find(".screen-dot").exists()).toBe(false);
  });
});
