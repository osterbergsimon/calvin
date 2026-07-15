/**
 * Regression: an invalid timezone value (e.g. the string "None" that the backend
 * persists when timezone is unset) must not crash the clock bar render.
 *
 * The compact layout reads `compactTimeParts`, whose catch block previously reused
 * the same invalid-timeZone options and re-threw, taking down the whole settings
 * view (RangeError: invalid time zone: None).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import { useConfigStore } from "@/stores/config";

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

describe("useClockBar with an invalid timezone", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the compact vertical bar without throwing when timezone is 'None'", () => {
    const store = useConfigStore();
    // Reproduces the poisoned value the backend stores via str(None).
    store.timezone = "None";
    store.clockShowSeconds = true;

    const errors = [];

    const wrapper = mount(ClockBarVertical, {
      props: {
        position: "left",
        showInNonKiosk: true,
        showInKiosk: false,
        enabled: true,
        previewMode: true,
        previewLayout: "compact-time",
      },
      global: {
        config: {
          errorHandler: err => errors.push(err),
        },
        stubs: {
          BarLogo: true,
          ScreenDots: true,
          BarActionCluster: true,
          PluginStatusbarItems: true,
        },
      },
    });

    expect(errors.map(e => e.message).join("\n")).toBe("");
    // The compact time should render digits, not blow up.
    expect(wrapper.find(".compact-time").exists()).toBe(true);
  });
});
