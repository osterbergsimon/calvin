// frontend/tests/unit/components/settings/ThisBrowserSettings.spec.js
// The per-browser rows of Default-is-a-screen §6 (settings copy audit §2,
// CLV-27 storage).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ThisBrowserSettings from "@/components/settings/categories/ThisBrowserSettings.vue";
import { useConfigStore } from "@/stores/config";
import { forgetOskHardware, learnHardwareKeyboard } from "@/composables/useOnScreenKeyboard";

const baseConfig = {
  touchControls: "auto",
  onScreenKeyboard: "auto",
  uiSize: "default",
};

const mountBrowser = (overrides = {}) =>
  mount(ThisBrowserSettings, { props: { config: { ...baseConfig, ...overrides } } });

const control = (wrapper, label) =>
  wrapper.findAllComponents({ name: "SegmentedControl" }).find(c => c.props("ariaLabel") === label);
const row = (wrapper, label) =>
  wrapper.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

describe("ThisBrowserSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
    forgetOskHardware();
    vi.clearAllMocks();
  });

  it("lists only the per-browser rows", () => {
    const wrapper = mountBrowser();
    expect(row(wrapper, "Touchscreen")).toBeTruthy();
    expect(row(wrapper, "On-screen keyboard")).toBeTruthy();
    expect(row(wrapper, "Settings text size")).toBeTruthy();
    expect(wrapper.findAllComponents({ name: "SettingRow" })).toHaveLength(3);
    expect(wrapper.text()).toContain("Same as Default");
    expect(wrapper.text()).not.toContain("Only this screen");
    expect(wrapper.text()).not.toContain("Same as all screens");
  });

  it("stores Touchscreen in this browser, not on the server", async () => {
    const wrapper = mountBrowser();
    control(wrapper, "Touchscreen").vm.$emit("update:modelValue", "off");
    await flushPromises();

    expect(window.localStorage.getItem("calvin-touch-controls")).toBe("off");
    expect(wrapper.emitted("changed")).toBeTruthy();
    expect(wrapper.text()).toContain("Changed here");
  });

  it("reads the server value while this browser has no choice of its own", () => {
    const wrapper = mountBrowser({ touchControls: "on" });
    expect(control(wrapper, "Touchscreen").props("modelValue")).toBe("on");
    expect(wrapper.text()).toContain("Same as Default");
  });

  it("Reset to default drops this browser's choice", async () => {
    const wrapper = mountBrowser();
    control(wrapper, "Touchscreen").vm.$emit("update:modelValue", "off");
    await flushPromises();

    await wrapper.find("[data-test='reset-browser-touch']").trigger("click");
    await flushPromises();
    expect(window.localStorage.getItem("calvin-touch-controls")).toBeNull();
    expect(control(wrapper, "Touchscreen").props("modelValue")).toBe("auto");
  });

  describe("on-screen keyboard (CLV-27 §6)", () => {
    it("describes Auto before anything was learned", () => {
      const wrapper = mountBrowser();
      expect(wrapper.text()).toContain(
        "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen."
      );
      expect(wrapper.find("[data-test='osk-show-again']").exists()).toBe(false);
    });

    it("describes Auto after a keyboard was used, with a way back", () => {
      learnHardwareKeyboard();
      const wrapper = mountBrowser();
      expect(wrapper.text()).toContain("Hidden here because a keyboard was used.");
      expect(wrapper.find("[data-test='osk-show-again']").text()).toBe("Show it again");
    });

    it("describes Always and Never", () => {
      expect(mountBrowser({ onScreenKeyboard: "on" }).text()).toContain(
        "Shows whenever you tap a text field."
      );
      expect(mountBrowser({ onScreenKeyboard: "off" }).text()).toContain(
        "Never shows by itself. On a touchscreen, tap Keyboard by a field to open it."
      );
    });

    it("saves the chosen mode for this browser", async () => {
      const wrapper = mountBrowser();
      control(wrapper, "On-screen keyboard").vm.$emit("update:modelValue", "off");
      await flushPromises();
      expect(window.localStorage.getItem("calvin-osk-mode")).toBe("off");
    });

    it("Show it again clears the learned flag and announces it", async () => {
      learnHardwareKeyboard();
      const wrapper = mountBrowser();
      await wrapper.find("[data-test='osk-show-again']").trigger("click");

      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBeNull();
      expect(wrapper.text()).toContain(
        "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen."
      );
      expect(wrapper.find("[data-test='osk-live']").text()).toBe(
        "On-screen keyboard will show again."
      );
    });
  });

  describe("settings text size (§2, §6)", () => {
    it("stores the size here and applies it at once", async () => {
      const wrapper = mountBrowser();
      control(wrapper, "Settings text size").vm.$emit("update:modelValue", "large");
      await flushPromises();

      expect(window.localStorage.getItem("calvin-ui-size")).toBe("large");
      expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.15");
    });

    it("falls back to the server size here has no choice", () => {
      useConfigStore().uiSize = "compact";
      const wrapper = mountBrowser({ uiSize: "compact" });
      expect(control(wrapper, "Settings text size").props("modelValue")).toBe("compact");
    });

    it("Reset to default goes back to the server size", async () => {
      window.localStorage.setItem("calvin-ui-size", "large");
      const wrapper = mountBrowser();
      expect(wrapper.text()).toContain("Changed here");

      await wrapper.find("[data-test='reset-browser-text-size']").trigger("click");
      await flushPromises();
      expect(window.localStorage.getItem("calvin-ui-size")).toBeNull();
      expect(control(wrapper, "Settings text size").props("modelValue")).toBe("default");
    });
  });
});
