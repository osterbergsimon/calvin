/** Tests for ClockBarHorizontal component. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import { useConfigStore } from "@/stores/config";
import { useKiosksStore } from "@/stores/kiosks";

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

describe("ClockBarHorizontal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.sessionStorage.clear();
  });

  const globalMountOptions = {
    stubs: {
      BarActionCluster: true,
    },
  };

  it("should render when enabled and showInNonKiosk is true and UI is visible", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-horizontal").exists()).toBe(true);
  });

  it("should not render when enabled but showInNonKiosk is false and UI is visible", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
        showInNonKiosk: false,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-horizontal").exists()).toBe(false);
  });

  it("should render when enabled and showInKiosk is true and UI is hidden", () => {
    const store = useConfigStore();
    store.showUI = false;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
        showInNonKiosk: false,
        showInKiosk: true,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-horizontal").exists()).toBe(true);
  });

  it("should not render when disabled", () => {
    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: false,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-horizontal").exists()).toBe(false);
  });

  it("should apply correct position class", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "bottom",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
      },
      global: {
        ...globalMountOptions,
      },
    });

    expect(wrapper.find(".clock-bar-horizontal.position-bottom").exists()).toBe(true);
  });

  it("should display time", () => {
    const store = useConfigStore();
    store.showUI = true;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
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

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
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

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
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
    store.clockBarFontSize = 24;

    const wrapper = mount(ClockBarHorizontal, {
      props: {
        position: "top",
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
    expect(timeElement.attributes("style")).toContain("font-size: 24px");
  });

  it("shows a screen's own name in its clock bar", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "kitchen");
    const store = useConfigStore();
    store.showUI = true;
    const kiosks = useKiosksStore();
    kiosks.kiosks = [{ id: "kitchen", overrides: { displayName: "Vardagsrummet" } }];
    kiosks.loadKiosks = vi.fn(async () => {});
    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { stubs: { BarActionCluster: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Vardagsrummet");
  });

  it("shows nothing in an unnamed screen's clock bar", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "kitchen");
    // Even a stale global name never reaches the bar: only the screen's own
    // Name override does (CLV-84).
    const store = useConfigStore();
    store.showUI = true;
    store.displayName = "Global lounge";
    const kiosks = useKiosksStore();
    kiosks.kiosks = [{ id: "kitchen", hostname: "kitchen-pi", overrides: {} }];
    kiosks.loadKiosks = vi.fn(async () => {});
    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { stubs: { BarActionCluster: true } },
    });
    await flushPromises();
    expect(wrapper.find(".clock-bar-room").exists()).toBe(false);
  });

  it("shows no room in a browser that is not a set-up screen", async () => {
    const store = useConfigStore();
    store.showUI = true;
    store.displayName = "Lounge";
    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { stubs: { BarActionCluster: true } },
    });
    await flushPromises();
    expect(wrapper.find(".clock-bar-room").exists()).toBe(false);
  });

  it("keeps the screen dots in the left group the phone rule hides", () => {
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

    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { stubs: { BarActionCluster: true } },
    });

    expect(wrapper.find(".clock-bar-left .screen-dots").exists()).toBe(true);
    expect(wrapper.find(".clock-bar-content .clock-time").exists()).toBe(true);
  });
});
