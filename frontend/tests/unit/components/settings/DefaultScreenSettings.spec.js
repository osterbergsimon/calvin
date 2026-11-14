// frontend/tests/unit/components/settings/DefaultScreenSettings.spec.js
// Default is a screen (docs/design/2026-10-30-default-screen.md §3).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import { useConfigStore } from "@/stores/config";
import { useKiosksStore } from "@/stores/kiosks";
import { forgetOskHardware } from "@/composables/useOnScreenKeyboard";

const stubs = { DisplayScheduleGrid: true, RebootCombo: true };
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
  availableScreens: null,
  defaultScreenId: null,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      { id: "home", name: "Home", layout: { version: 1, direction: "row", regions: [] } },
      { id: "photos", name: "Photos", layout: { version: 1, direction: "row", regions: [] } },
    ],
  },
};

const kiosk = (over = {}) => ({ id: "hall", hostname: "hall-pi", overrides: {}, ...over });

const mountDefault = (overrides = {}) =>
  mount(DefaultScreenSettings, {
    props: { config: { ...baseConfig, ...overrides } },
    global: { stubs },
  });

describe("DefaultScreenSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    forgetOskHardware();
  });

  it("renders Pages, Display, Power, Touch & keyboard and Remote & keys", () => {
    const wrapper = mountDefault();
    expect(wrapper.findAll("section.settings-section").map(s => s.attributes("id"))).toEqual([
      "section-default-pages",
      "section-screen-look",
      "section-layout",
      "section-screen-effects",
      "section-screen-controls",
      "section-device-power",
      "section-device-keyboard",
      "section-device-remote",
      "section-device-behaviour",
    ]);
    expect(wrapper.find("#section-layout .settings-section__eyebrow").text()).toBe("Display");
    expect(wrapper.find("#section-device-power .settings-section__eyebrow").text()).toBe("Power");
    expect(wrapper.find("#section-device-keyboard .settings-section__eyebrow").text()).toBe(
      "Touch & keyboard"
    );
    // The whole remote is one section: the reboot keys left Power, the
    // bindings and Hide label after left Dashboard.
    expect(wrapper.find("#section-device-remote .settings-section__eyebrow").text()).toBe(
      "Remote & keys"
    );
    const remote = wrapper.find("#section-device-remote");
    expect(remote.findComponent({ name: "RebootCombo" }).exists()).toBe(true);
    expect(remote.findComponent({ name: "KeyboardTab" }).exists()).toBe(true);
    expect(
      wrapper.find("#section-device-power").findComponent({ name: "RebootCombo" }).exists()
    ).toBe(false);
  });

  it("has no Software section and no status header", () => {
    const wrapper = mountDefault();
    expect(wrapper.find("#section-screen-software").exists()).toBe(false);
    expect(wrapper.find("#section-screen-hardware").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "KioskStatusHeader" }).exists()).toBe(false);
  });

  it("has no Room name row (the name is per screen, CLV-84)", () => {
    const wrapper = mountDefault();
    expect(wrapper.text()).not.toContain("Room name");
    expect(wrapper.find("[data-test='default-room-name']").exists()).toBe(false);
    expect(wrapper.find("#section-default-name").exists()).toBe(false);
  });

  it("shows and writes the household photo time in Behaviour", () => {
    const wrapper = mountDefault({ photoRotationInterval: 600 });
    const row = wrapper
      .findAllComponents({ name: "ScreenSettingRow" })
      .find(r => r.props("descriptor").key === "photoRotationInterval");
    expect(row).toBeTruthy();
    expect(row.props("value")).toBe(600);
    row.vm.$emit("set", 1800);
    expect(wrapper.emitted("update:config")).toContainEqual([{ photoRotationInterval: 1800 }]);
  });

  it("emits orientation changes", () => {
    const wrapper = mountDefault();
    const orientation = wrapper
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    expect(wrapper.emitted("update:config").some(c => c[0].orientation === "portrait")).toBe(true);
  });

  it("writes the global on-screen keyboard value", () => {
    const config = useConfigStore();
    config.onScreenKeyboard = "auto";
    const wrapper = mountDefault({ onScreenKeyboard: "auto" });
    const control = wrapper
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "On-screen keyboard");

    expect(control.props("options").map(o => o.label)).toEqual(["Auto", "Always", "Never"]);
    control.vm.$emit("update:modelValue", "on");
    expect(wrapper.emitted("update:config")).toContainEqual([{ onScreenKeyboard: "on" }]);
    expect(window.localStorage.getItem("calvin-osk-mode")).toBeNull();
  });

  it("offers one Turn off when idle choice instead of a toggle plus seconds", () => {
    const wrapper = mountDefault({ displayTimeoutEnabled: true, displayTimeout: 900 });
    expect(wrapper.text()).toContain("Turn off when idle");
    expect(wrapper.text()).not.toContain("(0 = never)");
    const idle = wrapper
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Turn off when idle");
    expect(idle.props("modelValue")).toBe(900);
    expect(idle.props("options").map(o => o.label)).toEqual([
      "Never",
      "5 min",
      "15 min",
      "30 min",
      "1 hour",
      "2 hours",
    ]);
  });

  it("passes config through to the RebootCombo", () => {
    const wrapper = mountDefault();
    const reboot = wrapper.findComponent({ name: "RebootCombo" });
    expect(reboot.props("config")).toMatchObject({ rebootComboKey1: "KEY_1" });
  });

  describe("default-only rows are marked", () => {
    it("marks Timezone, the remote's shared rows and the keyboard layout rows", () => {
      const wrapper = mountDefault({ displayScheduleEnabled: true });
      // Timezone; Hide label after, reboot keys, bindings; layout and extras.
      expect(wrapper.findAll("[data-test='default-only-note']")).toHaveLength(6);
      expect(wrapper.find("[data-test='default-only-reboot']").text()).toContain(
        "Applies to every screen"
      );
      expect(wrapper.find("[data-test='default-only-bindings']").text()).toContain(
        "Applies to every screen"
      );
      expect(wrapper.find("#section-device-keyboard").text()).toContain("Applies to every screen");
    });

    it("does not mark the overridable rows", () => {
      const wrapper = mountDefault({ displayScheduleEnabled: true });
      const notes = wrapper
        .findAllComponents({ name: "SettingRow" })
        .filter(row => row.text().includes("Applies to every screen"))
        .map(row => row.props("label"));
      expect(notes).toEqual(["Timezone", "Keyboard layout", "Also switch to", "Hide label after"]);
    });
  });

  describe("on-screen keyboard layout rows (§7)", () => {
    const mountSettings = (overrides = {}) =>
      mountDefault({ onScreenKeyboard: "auto", ...overrides });

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

    it("keeps both descriptions at the normal SettingRow size, not meta notes", () => {
      const wrapper = mountSettings();
      for (const label of ["Keyboard layout", "Also switch to"]) {
        const row = wrapper
          .findAllComponents({ name: "SettingRow" })
          .find(candidate => candidate.props("label") === label);
        const description = row.find(".setting-row__desc");
        expect(description.exists(), `${label} has no description`).toBe(true);
        expect(description.find(".inline-note").exists(), `${label} uses an InlineNote`).toBe(
          false
        );
      }
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
      expect(layoutPill(wrapper).props("modelValue")).toBe("de");
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

      expect(wrapper.find("[data-test='osk-device-layout']").exists()).toBe(true);
      expect(wrapper.text()).toContain("This screen uses Deutsch, chosen on the keyboard.");

      await wrapper.find("[data-test='osk-device-layout'] button").trigger("click");

      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBeNull();
      expect(wrapper.find("[data-test='osk-device-layout']").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("chosen on the keyboard");
    });

    it("hides that line when the device has no choice of its own", () => {
      const wrapper = mountSettings({ oskLayout: "sv" });
      expect(wrapper.find("[data-test='osk-device-layout']").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("chosen on the keyboard");
    });

    it("ignores and removes the legacy auto-written key", () => {
      window.localStorage.setItem("calvin-osk-layout", "de");
      const wrapper = mountSettings({ oskLayout: "sv" });
      expect(wrapper.find("[data-test='osk-device-layout']").exists()).toBe(false);
      expect(window.localStorage.getItem("calvin-osk-layout")).toBeNull();
    });

    it("updates the line when the keyboard changes the choice while Settings is open", async () => {
      const wrapper = mountSettings({ oskLayout: "sv" });
      expect(wrapper.find("[data-test='osk-device-layout']").exists()).toBe(false);

      window.localStorage.setItem("calvin-osk-device-layout", "fr");
      window.dispatchEvent(new CustomEvent("calvin-osk-layout-change"));
      await nextTick();

      expect(wrapper.text()).toContain("This screen uses Français, chosen on the keyboard.");
    });

    it("disables both rows while the on-screen keyboard is off", () => {
      const on = mountSettings({ onScreenKeyboard: "on", oskLayout: "sv" });
      expect(on.find("[data-test='osk-layout-control']").attributes("inert")).toBeUndefined();
      expect(on.find("[data-test='osk-extra-control']").attributes("inert")).toBeUndefined();

      const off = mountSettings({ onScreenKeyboard: "off", oskLayout: "sv" });
      expect(off.find("[data-test='osk-layout-control']").attributes("inert")).toBe("");
      expect(off.find("[data-test='osk-extra-control']").attributes("inert")).toBe("");
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

// Settings copy audit §3.3 — verbatim.
describe("DefaultScreenSettings copy (§3.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    forgetOskHardware();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  const COPY = [
    ["Orientation", "Which way the screen is mounted. Pages & regions decides how regions stack."],
    ["Upside down", "For screens mounted with the cable on top."],
    [
      "Rotate the screen output",
      "On: Calvin turns the Pi's picture itself. Off: leave it to the OS or the screen.",
    ],
    ["Screen on/off schedule", "Turns the screen off and on at set times."],
    [
      "Touchscreen",
      "Shows touch buttons: arrows, page dots and close. Auto works for most screens; choose On if a touch panel acts like a mouse.",
    ],
  ];

  it.each(COPY)("%s says exactly what it does", (label, description) => {
    const w = mountDefault({ displayScheduleEnabled: true });
    expect(row(w, label).props("description")).toBe(description);
  });

  it("calls the Pi's own zone the server's timezone and marks it default-only", () => {
    const w = mountDefault({ displayScheduleEnabled: true });
    const timezone = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("label") === undefined && c.props("options")[0].value === "system");
    expect(timezone.props("options")[0].label).toBe("Server's timezone");
    expect(row(w, "Timezone").text()).toContain("Used by the schedule.");
    expect(row(w, "Timezone").text()).toContain("Applies to every screen");
  });

  it("writes Never as timeout off and any other choice as seconds", () => {
    const w = mountDefault({ displayTimeoutEnabled: true, displayTimeout: 900 });
    const idle = () =>
      w
        .findAllComponents({ name: "SelectPill" })
        .find(c => c.props("ariaLabel") === "Turn off when idle");

    idle().vm.$emit("update:modelValue", 0);
    idle().vm.$emit("update:modelValue", 1800);

    const patches = w.emitted("update:config").map(c => c[0]);
    expect(patches).toContainEqual({ displayTimeoutEnabled: false });
    expect(patches).toContainEqual({ displayTimeoutEnabled: true, displayTimeout: 1800 });
  });

  it("shows an existing value that is not in the list as its own option", () => {
    const w = mountDefault({ displayTimeoutEnabled: true, displayTimeout: 420 });
    const idle = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Turn off when idle");
    expect(idle.props("options").map(o => o.label)).toContain("7 min");
  });

  it("no longer offers Screen now — it moved to System", () => {
    const w = mountDefault();
    expect(w.text()).not.toContain("Screen now");
    expect(w.findAll(".device-actions")).toHaveLength(0);
  });
});

// CLV-46 — the schedule editor used to offer 11 hardcoded zones.
describe("DefaultScreenSettings — timezone picker (CLV-46)", () => {
  const realSupportedValuesOf = Intl.supportedValuesOf;
  const setSupportedValuesOf = impl =>
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      writable: true,
      value: impl,
    });

  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  afterEach(() => setSupportedValuesOf(realSupportedValuesOf));

  const mountWithZone = timezone => mountDefault({ displayScheduleEnabled: true, timezone });

  const timezonePill = w =>
    w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("options")?.[0]?.value === "system");

  it("offers the engine's full IANA list in a searchable pill", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm", "America/New_York", "Asia/Tokyo"]);
    const pill = timezonePill(mountWithZone(null));

    expect(pill.props("searchable")).toBe(true);
    expect(pill.props("options")[0].label).toBe("Server's timezone");
    expect(pill.props("options").map(o => o.value)).toEqual([
      "system",
      "UTC",
      "Europe/Stockholm",
      "America/New_York",
      "Asia/Tokyo",
    ]);
    expect(pill.props("options").map(o => o.label)).toContain("America/New York");
  });

  it("falls back to the old list plus the stored zone when the API is missing", () => {
    setSupportedValuesOf(undefined);
    const pill = timezonePill(mountWithZone("Europe/Berlin"));
    const values = pill.props("options").map(o => o.value);

    expect(values).toContain("Europe/Stockholm");
    expect(values).toContain("Asia/Tokyo");
    expect(values).toContain("Europe/Berlin");
  });

  it("keeps the stored zone selected and visible when the list lacks it", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    const pill = timezonePill(mountWithZone("Antarctica/Troll"));

    expect(pill.props("modelValue")).toBe("Antarctica/Troll");
    expect(pill.props("options")[1]).toEqual({
      value: "Antarctica/Troll",
      label: "Antarctica/Troll",
    });
  });

  it("round-trips the stored zone and writes null for Server's timezone", () => {
    setSupportedValuesOf(() => ["Europe/Stockholm"]);
    const w = mountWithZone("Europe/Stockholm");
    const pill = timezonePill(w);
    expect(pill.props("modelValue")).toBe("Europe/Stockholm");

    pill.vm.$emit("update:modelValue", "Europe/Stockholm");
    pill.vm.$emit("update:modelValue", "system");
    const patches = w.emitted("update:config") || [];
    expect(patches).toContainEqual([{ timezone: "Europe/Stockholm" }]);
    expect(patches).toContainEqual([{ timezone: null }]);
  });
});

describe("DefaultScreenSettings — override notes (§5)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("keeps no note when no screen overrides the changed key", async () => {
    useKiosksStore().kiosks = [kiosk({ overrides: { displayName: "Hallway" } })];
    const w = mountDefault();
    const orientation = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(w.find("[data-test='default-override-note']").exists()).toBe(false);
  });

  it("can be dismissed", async () => {
    useKiosksStore().kiosks = [kiosk({ overrides: { orientation: "portrait" } })];
    const w = mountDefault();
    const orientation = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "landscape");
    await flushPromises();
    expect(w.find("[data-test='default-override-note']").exists()).toBe(true);

    await w.find(".default-note__dismiss").trigger("click");
    expect(w.find("[data-test='default-override-note']").exists()).toBe(false);
  });

  it("names the screens that keep their own Behaviour value", async () => {
    const store = useKiosksStore();
    store.kiosks = [
      kiosk({
        id: "hallway",
        hostname: "hall-pi",
        overrides: { displayName: "Hallway", loadingLight: "off" },
      }),
    ];
    store.saveOverrides = vi.fn(async () => {});
    const w = mountDefault();
    const loading = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Loading light");

    loading.vm.$emit("update:modelValue", "pulse");
    await flushPromises();

    const note = w.find("[data-test='default-override-note']");
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Hallway keeps its own Loading light.");

    await w.find("[data-test='default-note-change']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("hallway", { displayName: "Hallway" });
  });
});

// calvin-uudb: the Default page's Effects row writes the household config, not
// this device's choice (the F1 bug the Behaviour rows still have).
describe("DefaultScreenSettings effects (calvin-uudb)", () => {
  const effectsControl = w =>
    w.findAllComponents({ name: "SegmentedControl" }).find(c => c.props("ariaLabel") === "Effects");

  it("shows the household level and writes the household config", async () => {
    const w = mountDefault({ effectsLevel: "full" });
    expect(w.find("#section-screen-effects").exists()).toBe(true);
    expect(effectsControl(w).props("modelValue")).toBe("full");
    expect(
      effectsControl(w)
        .props("options")
        .map(o => o.label)
    ).toEqual(["Auto", "Full", "Standard"]);

    effectsControl(w).vm.$emit("update:modelValue", "standard");
    await flushPromises();

    expect(w.emitted("update:config")).toContainEqual([{ effectsLevel: "standard" }]);
    expect(localStorage.getItem("calvin-screen-effectsLevel")).toBeNull();
  });

  it("shows what Auto picks for the home and can go back to Auto", async () => {
    const w = mountDefault({ effectsLevel: "auto" });
    expect(w.find("#section-screen-effects").text()).toContain(
      "Auto (Standard on screens, Full in a browser)"
    );

    effectsControl(w).vm.$emit("update:modelValue", "standard");
    await flushPromises();
    expect(w.emitted("update:config")).toContainEqual([{ effectsLevel: "standard" }]);
  });
});

// §7 item 4: Effects & focus and Controls moved from Dashboard. Default is the
// household value, so each row writes update:config and never localStorage.
describe("DefaultScreenSettings effects and controls (§7 item 4)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);
  const control = (w, kind, label) =>
    w.findAllComponents({ name: kind }).find(c => c.props("ariaLabel") === label);
  const lastPatch = w => (w.emitted("update:config") || []).at(-1)?.[0];

  it("puts the whole Effects & focus group under one section", () => {
    const w = mountDefault();
    const section = w.find("#section-screen-effects");
    expect(section.exists()).toBe(true);
    expect(section.find(".settings-section__eyebrow").text()).toBe("Effects & focus");
    for (const label of [
      "Effects",
      "Focus light",
      "Dim other regions",
      "Show button presses",
      "Label size",
    ]) {
      expect(row(w, label), label).toBeTruthy();
    }
  });

  it("writes each Effects & focus row to the household config", async () => {
    const w = mountDefault({
      effectsLevel: "auto",
      focusLightMode: "interaction",
      focusLightDimOthers: true,
      keyboardFeedbackEnabled: true,
      keyboardFeedbackMode: "normal",
    });

    control(w, "SelectPill", "Focus light").vm.$emit("update:modelValue", "always");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ focusLightMode: "always" });

    control(w, "ToggleSwitch", "Dim other regions").vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ focusLightDimOthers: false });

    control(w, "ToggleSwitch", "Show button presses").vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ keyboardFeedbackEnabled: false });

    control(w, "SegmentedControl", "Label size").vm.$emit("update:modelValue", "small");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ keyboardFeedbackMode: "small" });

    for (const key of [
      "focusLightMode",
      "focusLightDimOthers",
      "keyboardFeedbackEnabled",
      "keyboardFeedbackMode",
    ]) {
      expect(window.localStorage.getItem(`calvin-screen-${key}`)).toBeNull();
    }
  });

  it("puts Controls on Default with Hide controls reading the household showUI", async () => {
    const w = mountDefault({ showUI: true });
    const section = w.find("#section-screen-controls");
    expect(section.exists()).toBe(true);
    expect(section.find(".settings-section__eyebrow").text()).toBe("Controls");

    // The row says Hide controls, but the stored key is showUI.
    const hide = control(w, "ToggleSwitch", "Hide controls");
    expect(hide.props("modelValue")).toBe(false);
    hide.vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ showUI: false });
    expect(window.localStorage.getItem("calvin-screen-showUI")).toBeNull();
  });

  it("writes keep-clock-bar, tap-anywhere and the corner rows to the household config", async () => {
    const w = mountDefault({ showUI: false, hotCornerPosition: "bottom-left" });

    control(w, "ToggleSwitch", "Keep the clock bar when hidden").vm.$emit(
      "update:modelValue",
      true
    );
    await flushPromises();
    expect(lastPatch(w)).toEqual({ clockBarShowInKiosk: true });

    control(w, "ToggleSwitch", "Tap anywhere to show controls").vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ tapAnywhereReveal: true });

    control(w, "SelectPill", "Show-controls corner").vm.$emit("update:modelValue", "top-right");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ hotCornerPosition: "top-right" });

    control(w, "NumberStepper", "Corner visibility percentage").vm.$emit("update:modelValue", 30);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ hotCornerOpacity: 30 });

    control(w, "RangeSlider", "Corner size in pixels").vm.$emit("update:modelValue", 80);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ hotCornerSize: 80 });

    control(w, "RangeSlider", "Hold for, in milliseconds").vm.$emit("update:modelValue", 700);
    await flushPromises();
    expect(lastPatch(w)).toEqual({ hotCornerLongPressMs: 700 });

    expect(window.localStorage.getItem("calvin-screen-hotCornerSize")).toBeNull();
  });

  it("keeps the corner rows behind Hide controls, like Dashboard did", async () => {
    const shown = mountDefault({ showUI: true });
    for (const label of ["Show-controls corner", "Corner visibility", "Corner size", "Hold for"]) {
      expect(row(shown, label), label).toBeUndefined();
    }

    const hidden = mountDefault({ showUI: false });
    expect(row(hidden, "Show-controls corner")).toBeTruthy();
    expect(row(hidden, "Corner visibility")).toBeTruthy();
    expect(row(hidden, "Corner size")).toBeTruthy();
    expect(row(hidden, "Hold for")).toBeTruthy();
  });
});

// §4 + F1: Photo frame, Loading light and Layout moved here from Dashboard ›
// Focus & remote. On Default they are the household values, so they write
// `update:config` (settings-scope §7 items 2–3).
describe("DefaultScreenSettings behaviour (§4, F1)", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);
  const control = (w, label) =>
    w.findAllComponents({ name: "SegmentedControl" }).find(c => c.props("ariaLabel") === label);
  // Default is a controlled household form: the Settings page applies the
  // change to its local config, which comes back down as the prop.
  const applyConfig = (w, patch) => w.setProps({ config: { ...w.props("config"), ...patch } });

  it("puts Photo frame, Start after and Photos from under Behaviour", async () => {
    const w = mountDefault();
    expect(w.find("#section-device-behaviour").exists()).toBe(true);
    expect(row(w, "Photo frame")).toBeTruthy();
    expect(row(w, "Start after")).toBeUndefined();
    expect(row(w, "Photos from")).toBeUndefined();

    control(w, "Photo frame").vm.$emit("update:modelValue", true);
    await flushPromises();
    await applyConfig(w, { photoFrameEnabled: true });

    expect(row(w, "Start after")).toBeTruthy();
    expect(row(w, "Photos from")).toBeTruthy();
    expect(w.find("#section-device-behaviour").text()).toContain("Photo frame");
    expect(w.find("#section-kiosk-touch-focus").exists()).toBe(false);
  });

  it("offers the shared 1–30 minute start-after choices, 5 min by default", async () => {
    const w = mountDefault();
    control(w, "Photo frame").vm.$emit("update:modelValue", true);
    await flushPromises();
    await applyConfig(w, { photoFrameEnabled: true });
    const start = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after");
    expect(start.props("modelValue")).toBe(300);
    expect(start.props("options").map(o => o.label)).toEqual([
      "1 min",
      "2 min",
      "5 min",
      "10 min",
      "15 min",
      "30 min",
    ]);
  });

  it("writes Photo frame, Loading light and Layout to the household config", async () => {
    const w = mountDefault();
    control(w, "Photo frame").vm.$emit("update:modelValue", true);
    control(w, "Loading light").vm.$emit("update:modelValue", "pulse");
    control(w, "Layout").vm.$emit("update:modelValue", "desktop");
    await flushPromises();

    const patches = w.emitted("update:config").map(call => call[0]);
    expect(patches).toContainEqual({ photoFrameEnabled: true });
    expect(patches).toContainEqual({ loadingLight: "pulse" });
    expect(patches).toContainEqual({ layoutMode: "desktop" });

    // Not this browser's choice, and not this kiosk's override.
    expect(localStorage.getItem("calvin-screen-photoFrameEnabled")).toBeNull();
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBeNull();
    expect(localStorage.getItem("calvin-layout-mode")).toBeNull();
    // Default rows never claim a per-screen scope.
    expect(w.find("#section-device-behaviour").text()).not.toContain("Changed here");
    expect(w.find("#section-device-behaviour").text()).not.toContain("Same as Default");
  });

  it("stores the chosen photo sources in the household config", async () => {
    const w = mountDefault();
    control(w, "Photo frame").vm.$emit("update:modelValue", true);
    await flushPromises();
    await applyConfig(w, { photoFrameEnabled: true });

    const picker = w.findComponent({ name: "PhotoSourcePicker" });
    expect(picker.props("modelValue")).toEqual([]);
    picker.vm.$emit("update:modelValue", ["image-1"]);
    await flushPromises();

    expect(w.emitted("update:config")).toContainEqual([{ photoFrameSourceIds: ["image-1"] }]);
    expect(localStorage.getItem("calvin-screen-photoFrameSourceIds")).toBeNull();
  });

  it("shows the household value even on a kiosk with its own merged value", () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hallway");
    useConfigStore().photoFrameEnabled = true;
    const w = mountDefault({ photoFrameEnabled: false });
    expect(control(w, "Photo frame").props("modelValue")).toBe(false);
  });

  it("falls back to the old global value until this screen chooses", () => {
    const w = mountDefault({ photoFrameEnabled: true, photoFrameTimeout: 600 });
    expect(control(w, "Photo frame").props("modelValue")).toBe(true);
    const start = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after");
    expect(start.props("modelValue")).toBe(600);
  });

  it("offers Comet · Pulse · Off under Behaviour, Comet by default", () => {
    const w = mountDefault();
    const loading = control(w, "Loading light");
    expect(loading.props("options").map(o => o.label)).toEqual(["Comet", "Pulse", "Off"]);
    expect(loading.props("modelValue")).toBe("comet");
    expect(row(w, "Loading light").text()).not.toContain("Same as Default");
  });

  it("saves the loading light to the household config", async () => {
    const w = mountDefault();
    control(w, "Loading light").vm.$emit("update:modelValue", "pulse");
    await flushPromises();

    expect(w.emitted("update:config")).toContainEqual([{ loadingLight: "pulse" }]);
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBeNull();
    expect(row(w, "Loading light").text()).not.toContain("Changed here");
  });

  it("explains the pulse when the device prefers less motion", () => {
    window.matchMedia = vi.fn(query => ({
      matches: /prefers-reduced-motion:\s*reduce/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const w = mountDefault();
    expect(row(w, "Loading light").text()).toContain(
      "This device prefers less motion, so it pulses."
    );
  });

  it("saves the layout to the household config", async () => {
    const w = mountDefault();
    control(w, "Layout").vm.$emit("update:modelValue", "phone");
    await flushPromises();
    expect(w.emitted("update:config")).toContainEqual([{ layoutMode: "phone" }]);
    expect(localStorage.getItem("calvin-layout-mode")).toBeNull();
  });
});

// F1 regression (settings-scope §7 item 3): changing the Behaviour rows on
// Default from a kiosk or a plain browser changes the household config, and
// touches neither the kiosk's override nor localStorage.
describe("DefaultScreenSettings F1 regression", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const control = (w, label) =>
    w.findAllComponents({ name: "SegmentedControl" }).find(c => c.props("ariaLabel") === label);

  it.each([
    ["a plain browser", false],
    ["a kiosk", true],
  ])("from %s, writes the household config and not the device", async (_name, kioskMode) => {
    const store = useKiosksStore();
    const overrides = {
      photoFrameEnabled: false,
      loadingLight: "off",
      layoutMode: "phone",
    };
    store.kiosks = [kiosk({ id: "hallway", overrides: { ...overrides } })];
    store.saveOverrides = vi.fn(async () => {});
    if (kioskMode) window.sessionStorage.setItem("calvin_kiosk_id", "hallway");

    const w = mountDefault({ photoFrameEnabled: false, loadingLight: "comet", layoutMode: "auto" });
    control(w, "Photo frame").vm.$emit("update:modelValue", true);
    control(w, "Loading light").vm.$emit("update:modelValue", "pulse");
    control(w, "Layout").vm.$emit("update:modelValue", "desktop");
    await flushPromises();

    const patches = w.emitted("update:config").map(call => call[0]);
    expect(patches).toContainEqual({ photoFrameEnabled: true });
    expect(patches).toContainEqual({ loadingLight: "pulse" });
    expect(patches).toContainEqual({ layoutMode: "desktop" });

    // The kiosk's own override and this browser's stored choice stay untouched.
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(store.kiosks[0].overrides).toEqual(overrides);
    expect(localStorage.getItem("calvin-screen-photoFrameEnabled")).toBeNull();
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBeNull();
    expect(localStorage.getItem("calvin-layout-mode")).toBeNull();
  });
});

// §7 item 6: Look moved from Dashboard › Appearance, and the two sizes moved
// into Display. On Default they are the household values, so they write
// update:config and never this browser's or this kiosk's own choice.
describe("DefaultScreenSettings Look and Display sizes (§7 item 6)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const control = (w, kind, label) =>
    w.findAllComponents({ name: kind }).find(c => c.props("ariaLabel") === label);
  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);
  const lastPatch = w => (w.emitted("update:config") || []).at(-1)?.[0];

  it("puts Look after Pages with Theme, Light or dark and Font", () => {
    const w = mountDefault();
    const section = w.find("#section-screen-look");
    expect(section.exists()).toBe(true);
    expect(section.find(".settings-section__eyebrow").text()).toBe("Look");
    for (const label of ["Theme", "Light or dark", "Font"]) {
      expect(row(w, label), label).toBeTruthy();
    }
    // Default has no per-row scope line.
    expect(section.text()).not.toContain("Same as Default");
    expect(section.text()).not.toContain("Changed here");
  });

  it("writes Theme, Light or dark and Font to the household config", async () => {
    const w = mountDefault({ selectedTheme: "ocean", themeMode: "auto", typeTheme: "instrument" });

    w.findComponent({ name: "ThemePicker" }).vm.$emit("select", "midnight");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ selectedTheme: "midnight" });

    control(w, "SelectPill", "Light or dark").vm.$emit("update:modelValue", "dark");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ themeMode: "dark" });

    control(w, "SelectPill", "Font").vm.$emit("update:modelValue", "station");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ typeTheme: "station" });

    expect(localStorage.getItem("calvin-type-theme")).toBeNull();
  });

  it("writes the dark hours to the household config on a schedule", async () => {
    const w = mountDefault({ themeMode: "time", darkModeStart: 18, darkModeEnd: 6 });
    const pickers = w.find("#section-screen-look").findAll('input[type="time"]');
    expect(pickers).toHaveLength(2);

    await pickers[0].setValue("20:00");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ darkModeStart: 20 });

    await w.find("#section-screen-look").findAll('input[type="time"]')[1].setValue("07:00");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ darkModeEnd: 7 });
  });

  it("names a screen that keeps its own Theme when Default's theme changes", async () => {
    const store = useKiosksStore();
    store.kiosks = [
      kiosk({
        id: "hallway",
        overrides: { displayName: "Hallway", selectedTheme: "midnight" },
      }),
    ];
    const w = mountDefault();
    w.findComponent({ name: "ThemePicker" }).vm.$emit("select", "ocean");
    await flushPromises();

    const note = w.find("[data-test='default-override-note']");
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Hallway keeps its own Theme.");
  });

  it("writes Dashboard size and Settings text size to the household config", async () => {
    const w = mountDefault({ touchControlSize: "medium", uiSize: "default" });

    control(w, "SelectPill", "Dashboard size").vm.$emit("update:modelValue", "large");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ touchControlSize: "large" });

    control(w, "SegmentedControl", "Settings text size").vm.$emit("update:modelValue", "compact");
    await flushPromises();
    expect(lastPatch(w)).toEqual({ uiSize: "compact" });

    // Default writes the household value; the plain-browser layer stays in
    // This browser (ThisBrowserSettings / useUiScale) and is not touched here.
    expect(localStorage.getItem("calvin-ui-size")).toBeNull();
    expect(localStorage.getItem("calvin-screen-uiSize")).toBeNull();
  });
});
