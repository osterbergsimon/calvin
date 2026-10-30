// frontend/tests/unit/components/settings/DeviceSettings.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DeviceSettings from "@/components/settings/categories/DeviceSettings.vue";
import { useConfigStore } from "@/stores/config";
import { forgetOskHardware, learnHardwareKeyboard } from "@/composables/useOnScreenKeyboard";

vi.mock("@/composables", () => ({
  useSystem: () => ({ turnDisplayOn: vi.fn(), turnDisplayOff: vi.fn() }),
}));

const stubs = { DisplayScheduleGrid: true, KeyboardTab: true, RebootCombo: true };
const baseConfig = {
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
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
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    forgetOskHardware();
  });

  it("renders Screen & keyboard sections; hardware moved to System", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    for (const id of ["layout", "device-power", "device-keyboard", "device-notifications"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
    // version numbers now live under System › Versions & status
    expect(wrapper.find("#section-device-hardware").exists()).toBe(false);
    // the standalone reboot section is gone; RebootCombo now lives in Keyboard
    expect(wrapper.find("#section-device-reboot").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "RebootCombo" }).exists()).toBe(true);
  });

  it("orders the sections Screen orientation, Screen power, Keyboard, Key-press feedback", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    expect(wrapper.findAll("section.settings-section").map(s => s.attributes("id"))).toEqual([
      "section-layout",
      "section-device-power",
      "section-device-keyboard",
      "section-device-notifications",
    ]);
    expect(wrapper.find("#section-layout .settings-section__eyebrow").text()).toBe(
      "Screen orientation"
    );
    expect(wrapper.find("#section-device-power .settings-section__eyebrow").text()).toBe(
      "Screen power"
    );
    expect(wrapper.find("#section-device-notifications .settings-section__eyebrow").text()).toBe(
      "Key-press feedback"
    );
  });

  it("emits orientation changes from the moved Screen orientation section", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    const orientation = wrapper
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    expect(wrapper.emitted("update:config").some(c => c[0].orientation === "portrait")).toBe(true);
  });

  it("emits update:config when keyboard feedback is toggled (notifications)", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    const toggles = wrapper.findAllComponents({ name: "ToggleSwitch" });
    for (const t of toggles) t.vm.$emit("update:modelValue", false);
    expect(wrapper.emitted("update:config").some(c => c[0].keyboardFeedbackEnabled === false)).toBe(
      true
    );
  });

  it("offers Auto / On / Off for the on-screen keyboard", () => {
    const config = useConfigStore();
    config.onScreenKeyboard = "auto";
    const wrapper = mount(DeviceSettings, {
      props: {
        config: { ...baseConfig, onScreenKeyboard: "auto" },
      },
      global: { stubs },
    });
    const control = wrapper
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "On-screen keyboard");

    expect(control).toBeTruthy();
    expect(control.props("options").map(o => o.label)).toEqual(["Auto", "On", "Off"]);

    control.vm.$emit("update:modelValue", "on");
    expect(window.localStorage.getItem("calvin-osk-mode")).toBe("on");
  });

  it("shows the timeout stepper only when timeout is enabled", async () => {
    const wrapper = mount(DeviceSettings, {
      props: {
        config: { ...baseConfig, displayTimeoutEnabled: true },
      },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Timeout");
  });

  it("passes config through to the folded-in RebootCombo", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig },
      global: { stubs },
    });
    const reboot = wrapper.findComponent({ name: "RebootCombo" });
    expect(reboot.exists()).toBe(true);
    expect(reboot.props("config")).toMatchObject({ rebootComboKey1: "KEY_1" });
  });

  describe("on-screen keyboard layout rows (§7)", () => {
    const mountSettings = (overrides = {}) => {
      useConfigStore().onScreenKeyboard = overrides.onScreenKeyboard ?? "auto";
      return mount(DeviceSettings, {
        props: {
          config: { ...baseConfig, onScreenKeyboard: "auto", ...overrides },
        },
        global: { stubs },
      });
    };

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
      forgetOskHardware();
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

    it("shows a layout chosen on the keyboard and can go back to the default", async () => {
      window.localStorage.setItem("calvin-osk-device-layout", "de");
      const wrapper = mountSettings({ oskLayout: "sv" });

      expect(wrapper.find(".device-osk-device").exists()).toBe(true);
      expect(wrapper.text()).toContain("This screen uses Deutsch, chosen on the keyboard.");

      await wrapper.find(".device-osk-use-default").trigger("click");

      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBeNull();
      expect(wrapper.find(".device-osk-device").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("chosen on the keyboard");
    });

    it("hides that line when the device has no choice of its own", () => {
      const wrapper = mountSettings({ oskLayout: "sv" });

      expect(wrapper.find(".device-osk-device").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("chosen on the keyboard");
    });

    it("ignores and removes the legacy auto-written key", () => {
      window.localStorage.setItem("calvin-osk-layout", "de");
      const wrapper = mountSettings({ oskLayout: "sv" });

      expect(wrapper.find(".device-osk-device").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("chosen on the keyboard");
      expect(window.localStorage.getItem("calvin-osk-layout")).toBeNull();
    });

    it("updates the line when the keyboard changes the choice while Settings is open", async () => {
      const wrapper = mountSettings({ oskLayout: "sv" });
      expect(wrapper.find(".device-osk-device").exists()).toBe(false);

      window.localStorage.setItem("calvin-osk-device-layout", "fr");
      window.dispatchEvent(new CustomEvent("calvin-osk-layout-change"));
      await nextTick();

      expect(wrapper.text()).toContain("This screen uses Français, chosen on the keyboard.");
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

  describe("on-screen keyboard mode row (CLV-27)", () => {
    const mountRow = (mode, { learned = false } = {}) => {
      useConfigStore().onScreenKeyboard = mode;
      if (learned) learnHardwareKeyboard();
      return mount(DeviceSettings, {
        props: { config: { ...baseConfig, onScreenKeyboard: mode } },
        global: { stubs },
      });
    };

    const modeControl = wrapper =>
      wrapper
        .findAllComponents({ name: "SegmentedControl" })
        .find(c => c.props("ariaLabel") === "On-screen keyboard");

    it("labels the row with the This screen chip", () => {
      const wrapper = mountRow("auto");

      expect(wrapper.find(".device-chip").text()).toBe("This screen");
      expect(wrapper.find("#section-device-keyboard").text()).toContain("On-screen keyboard");
    });

    it("describes Auto before anything was learned", () => {
      const wrapper = mountRow("auto");

      expect(wrapper.text()).toContain(
        "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen."
      );
      expect(wrapper.find(".device-osk-show-again").exists()).toBe(false);
    });

    it("describes Auto after a keyboard was used, with a way back", () => {
      const wrapper = mountRow("auto", { learned: true });

      expect(wrapper.text()).toContain("Hidden here because a keyboard was used.");
      expect(wrapper.find(".device-osk-show-again").text()).toBe("Show it again");
    });

    it("describes On and Off", () => {
      expect(mountRow("on").text()).toContain("Shows whenever you tap a text field.");
      expect(mountRow("off").text()).toContain(
        "Never shows by itself. On a touchscreen, tap Keyboard by a field to open it."
      );
    });

    it("saves the chosen mode for this browser", () => {
      const wrapper = mountRow("auto");

      modeControl(wrapper).vm.$emit("update:modelValue", "off");

      expect(window.localStorage.getItem("calvin-osk-mode")).toBe("off");
    });

    it("Show it again clears the learned flag and announces it", async () => {
      const wrapper = mountRow("auto", { learned: true });

      await wrapper.find(".device-osk-show-again").trigger("click");

      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBeNull();
      expect(wrapper.text()).toContain(
        "Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen."
      );
      expect(wrapper.find(".device-live").text()).toBe("On-screen keyboard will show again.");
    });
  });
});
