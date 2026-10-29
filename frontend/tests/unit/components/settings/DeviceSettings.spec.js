// frontend/tests/unit/components/settings/DeviceSettings.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DeviceSettings from "@/components/settings/categories/DeviceSettings.vue";

vi.mock("@/composables", () => ({
  useSystem: () => ({ turnDisplayOn: vi.fn(), turnDisplayOff: vi.fn() }),
}));

const stubs = { DisplayScheduleGrid: true, KeyboardTab: true, RebootCombo: true };
const baseConfig = {
  displayScheduleEnabled: false,
  displaySchedule: [],
  timezone: null,
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  // keyboard-feedback notifications (moved here from Display — calvin-svo IA pass)
  keyboardFeedbackEnabled: true,
  keyboardFeedbackMode: "normal",
  modeIndicatorTimeout: 5,
};

describe("DeviceSettings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the device sections; the reboot combo is folded into Keyboard (calvin-…)", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    for (const id of [
      "device-power",
      "device-keyboard",
      "device-notifications",
      "device-hardware",
    ]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
    // the standalone reboot section is gone; RebootCombo now lives in Keyboard
    expect(wrapper.find("#section-device-reboot").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "RebootCombo" }).exists()).toBe(true);
  });

  it("emits update:config when keyboard feedback is toggled (notifications)", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: null, frontendVersion: null },
      global: { stubs },
    });
    const toggles = wrapper.findAllComponents({ name: "ToggleSwitch" });
    for (const t of toggles) t.vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("update:config").some(c => c[0].keyboardFeedbackEnabled === false)).toBe(
      true
    );
  });

  it("offers Auto / Always / Off for the on-screen keyboard", () => {
    const wrapper = mount(DeviceSettings, {
      props: {
        config: { ...baseConfig, onScreenKeyboard: "auto" },
        version: null,
        frontendVersion: null,
      },
      global: { stubs },
    });
    const control = wrapper
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "On-screen keyboard");

    expect(control).toBeTruthy();
    expect(control.props("options").map(o => o.label)).toEqual(["Auto", "Always", "Off"]);

    control.vm.$emit("update:modelValue", "on");
    expect(wrapper.emitted("update:config").some(c => c[0].onScreenKeyboard === "on")).toBe(true);
  });

  it("shows the timeout stepper only when timeout is enabled", async () => {
    const wrapper = mount(DeviceSettings, {
      props: {
        config: { ...baseConfig, displayTimeoutEnabled: true },
        version: null,
        frontendVersion: null,
      },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Timeout");
  });

  it("renders the backend version in Hardware", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("1.2.3");
  });

  it("passes config through to the folded-in RebootCombo", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: null, frontendVersion: null },
      global: { stubs },
    });
    const reboot = wrapper.findComponent({ name: "RebootCombo" });
    expect(reboot.exists()).toBe(true);
    expect(reboot.props("config")).toMatchObject({ rebootComboKey1: "KEY_1" });
  });

  describe("on-screen keyboard layout rows (§7)", () => {
    const mountSettings = (overrides = {}) =>
      mount(DeviceSettings, {
        props: {
          config: { ...baseConfig, onScreenKeyboard: "auto", ...overrides },
          version: null,
          frontendVersion: null,
        },
        global: { stubs },
      });

    const layoutPill = wrapper =>
      wrapper
        .findAllComponents({ name: "SelectPill" })
        .find(c => c.props("ariaLabel") === "Keyboard layout");
    const extraChips = wrapper =>
      wrapper
        .findAllComponents({ name: "ChipMultiSelect" })
        .find(c => c.props("ariaLabel") === "Also switch to");

    beforeEach(() => {
      window.localStorage.clear();
      Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    });

    it("calls it a layout, not a language, and names the layouts in their own language", () => {
      const wrapper = mountSettings();
      const pill = layoutPill(wrapper);

      expect(pill).toBeTruthy();
      expect(wrapper.text()).toContain("Keyboard layout");
      expect(wrapper.text()).toContain(
        "The letters the on-screen keyboard uses. Separate from the language Calvin is shown in."
      );
      expect(pill.props("options").map(o => o.label)).toEqual([
        "English",
        "Svenska",
        "Suomi",
        "Norsk",
        "Dansk",
        "Deutsch",
        "Français",
      ]);
    });

    it("shows the browser's suggested layout, marked (suggested), while none is picked", () => {
      Object.defineProperty(navigator, "language", { configurable: true, value: "sv-SE" });
      const wrapper = mountSettings({ oskLayout: null });
      const pill = layoutPill(wrapper);

      expect(pill.props("modelValue")).toBe("sv");
      expect(wrapper.text()).toContain("Svenska (suggested)");
      expect(window.localStorage.getItem("calvin-osk-layout-hint")).toBe("sv");
    });

    it("drops (suggested) once a layout is saved", () => {
      Object.defineProperty(navigator, "language", { configurable: true, value: "sv-SE" });
      const wrapper = mountSettings({ oskLayout: "de" });
      const pill = layoutPill(wrapper);

      expect(pill.props("modelValue")).toBe("de");
      expect(wrapper.text()).not.toContain("(suggested)");
    });

    it("saves the picked main layout and drops it from the extras", () => {
      const wrapper = mountSettings({ oskLayout: "sv", oskExtraLayouts: ["en", "de"] });
      layoutPill(wrapper).vm.$emit("update:modelValue", "de");

      const saved = wrapper
        .emitted("update:config")
        .map(call => call[0])
        .find(patch => "oskLayout" in patch);
      expect(saved).toEqual({ oskLayout: "de", oskExtraLayouts: ["en"] });
    });

    it("offers every other layout under 'Also switch to', never the main one", () => {
      const wrapper = mountSettings({ oskLayout: "sv", oskExtraLayouts: ["en"] });
      const chips = extraChips(wrapper);

      expect(wrapper.text()).toContain(
        "Adds a key to the keyboard that switches between these and Svenska."
      );
      expect(chips.props("options").map(o => o.value)).toEqual([
        "en",
        "fi",
        "no",
        "da",
        "de",
        "fr",
      ]);
      expect(chips.props("modelValue")).toEqual(["en"]);
    });

    it("saves the chosen extra layouts", () => {
      const wrapper = mountSettings({ oskLayout: "sv", oskExtraLayouts: [] });
      extraChips(wrapper).vm.$emit("update:modelValue", ["en", "fi"]);

      expect(
        wrapper
          .emitted("update:config")
          .map(call => call[0])
          .find(patch => "oskExtraLayouts" in patch)
      ).toEqual({ oskExtraLayouts: ["en", "fi"] });
    });

    it("dims and disables both rows while the on-screen keyboard is off", () => {
      const on = mountSettings({ onScreenKeyboard: "on", oskLayout: "sv" });
      expect(on.find(".device-osk-layout").classes()).not.toContain("setting-row--muted");
      expect(on.find(".device-osk-layout .device-control").attributes("inert")).toBeUndefined();
      expect(on.find(".device-osk-extra .device-control").attributes("inert")).toBeUndefined();

      const off = mountSettings({ onScreenKeyboard: "off", oskLayout: "sv" });
      expect(off.find(".device-osk-layout").classes()).toContain("setting-row--muted");
      expect(off.find(".device-osk-layout .device-control").attributes("inert")).toBe("");
      expect(off.find(".device-osk-extra").classes()).toContain("setting-row--muted");
      expect(off.find(".device-osk-extra .device-control").attributes("inert")).toBe("");
    });

    it("is unaffected by the UI language", () => {
      document.documentElement.lang = "de";
      const wrapper = mountSettings({ oskLayout: "sv" });

      expect(layoutPill(wrapper).props("modelValue")).toBe("sv");
      expect(wrapper.text()).not.toContain("(suggested)");
      document.documentElement.removeAttribute("lang");
    });
  });
});
