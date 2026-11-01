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

  it("renders Pages, Display, Power and Touch & keyboard", () => {
    const wrapper = mountDefault();
    expect(wrapper.findAll("section.settings-section").map(s => s.attributes("id"))).toEqual([
      "section-default-pages",
      "section-layout",
      "section-device-power",
      "section-device-keyboard",
      "section-device-behaviour",
    ]);
    expect(wrapper.find("#section-layout .settings-section__eyebrow").text()).toBe("Display");
    expect(wrapper.find("#section-device-power .settings-section__eyebrow").text()).toBe("Power");
    expect(wrapper.find("#section-device-keyboard .settings-section__eyebrow").text()).toBe(
      "Touch & keyboard"
    );
    // Remote & buttons and key-press feedback stayed in Dashboard.
    expect(wrapper.find("#section-device-buttons").exists()).toBe(false);
    // The reboot combo lives under Power.
    expect(wrapper.find("#section-device-reboot").exists()).toBe(false);
    expect(
      wrapper.find("#section-device-power").findComponent({ name: "RebootCombo" }).exists()
    ).toBe(true);
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
    it("marks Timezone, the reboot combo and the keyboard layout rows", () => {
      const wrapper = mountDefault({ displayScheduleEnabled: true });
      expect(wrapper.findAll("[data-test='default-only-note']")).toHaveLength(4);
      expect(wrapper.find("[data-test='default-only-reboot']").text()).toContain(
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
      expect(notes).toEqual(["Timezone", "Keyboard layout", "Also switch to"]);
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
});

// §4: Photo frame, Loading light and Layout moved here from Dashboard › Focus
// & remote; they keep their per-screen storage.
describe("DefaultScreenSettings behaviour (§4)", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.sessionStorage.clear();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  it("puts Photo frame, Start after and Photos from under Behaviour", async () => {
    const w = mountDefault();
    expect(w.find("#section-device-behaviour").exists()).toBe(true);
    expect(row(w, "Photo frame")).toBeTruthy();
    expect(row(w, "Start after")).toBeUndefined();
    expect(row(w, "Photos from")).toBeUndefined();

    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();

    expect(row(w, "Start after")).toBeTruthy();
    expect(row(w, "Photos from")).toBeTruthy();
    expect(w.find("#section-device-behaviour").text()).toContain("Photo frame");
    expect(w.find("#section-kiosk-touch-focus").exists()).toBe(false);
  });

  it("offers the shared 1–30 minute start-after choices, 5 min by default", async () => {
    const w = mountDefault();
    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();
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

  it("stores the choice on this screen, not in the global config", async () => {
    const w = mountDefault();
    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();

    expect(localStorage.getItem("calvin-screen-photoFrameEnabled")).toBe("true");
    expect((w.emitted("update:config") || []).some(c => "photoFrameEnabled" in c[0])).toBe(false);
    expect(row(w, "Photo frame").text()).toContain("Changed here");

    await w.find('[data-test="reset-photo-frame"]').trigger("click");
    await flushPromises();
    expect(localStorage.getItem("calvin-screen-photoFrameEnabled")).toBeNull();
    expect(row(w, "Photo frame").text()).toContain("Same as Default");
  });

  it("stores the chosen photo sources as a list for this screen", async () => {
    const w = mountDefault();
    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();

    const picker = w.findComponent({ name: "PhotoSourcePicker" });
    expect(picker.props("modelValue")).toEqual([]);
    picker.vm.$emit("update:modelValue", ["image-1"]);
    await flushPromises();

    expect(JSON.parse(localStorage.getItem("calvin-screen-photoFrameSourceIds"))).toEqual([
      "image-1",
    ]);
  });

  it("reads the kiosk's merged photo frame but leaves the form value for global rows", () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hallway");
    useConfigStore().photoFrameEnabled = true;
    const w = mountDefault();
    expect(
      row(w, "Photo frame").findComponent({ name: "SegmentedControl" }).props("modelValue")
    ).toBe(true);
  });

  it("falls back to the old global value until this screen chooses", () => {
    const w = mountDefault({ photoFrameEnabled: true, photoFrameTimeout: 600 });
    const frame = row(w, "Photo frame").findComponent({ name: "SegmentedControl" });
    expect(frame.props("modelValue")).toBe(true);
    const start = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after");
    expect(start.props("modelValue")).toBe(600);
  });

  const loadingControl = w =>
    w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Loading light");

  it("offers Comet · Pulse · Off under Behaviour, Comet by default", () => {
    const w = mountDefault();
    const control = loadingControl(w);
    expect(control.props("options").map(o => o.label)).toEqual(["Comet", "Pulse", "Off"]);
    expect(control.props("modelValue")).toBe("comet");
    expect(row(w, "Loading light").text()).toContain("Same as Default");
  });

  it("saves the loading light for this screen, then resets to the Default", async () => {
    const w = mountDefault();
    loadingControl(w).vm.$emit("update:modelValue", "pulse");
    await flushPromises();
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBe("pulse");
    expect(loadingControl(w).props("modelValue")).toBe("pulse");
    expect(row(w, "Loading light").text()).toContain("Changed here");

    await w.find('[data-test="reset-loading-light"]').trigger("click");
    await flushPromises();
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBeNull();
    expect(loadingControl(w).props("modelValue")).toBe("comet");
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

  it("saves the layout for this screen", async () => {
    const w = mountDefault();
    const layout = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Layout");
    layout.vm.$emit("update:modelValue", "phone");
    await flushPromises();
    expect(localStorage.getItem("calvin-layout-mode")).toBe("phone");
    expect(row(w, "Layout").text()).toContain("Changed here");
  });
});
