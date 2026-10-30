import { describe, it, expect, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardSettings from "@/components/settings/categories/DashboardSettings.vue";

const baseConfig = () => ({
  orientation: "landscape",
  darkModeStart: 18,
  darkModeEnd: 6,
  showUI: true,
  orientationFlipped: false,
  applyDisplayRotation: true,
  selectedTheme: null,
  themeMode: "auto",
  focusLightMode: "interaction",
  focusLightDimOthers: true,
  clockBarShowInKiosk: false,
  touchControls: "auto",
  touchControlSize: "medium",
  displayName: "",
});

const stubs = {
  ThemePicker: true,
  TypefacePicker: true,
  ClockBarFontSizePicker: true,
  ClockBarItemsTab: true,
};

const sectionIds = wrapper =>
  wrapper.findAll("section.settings-section").map(section => section.attributes("id"));

describe("DashboardSettings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the dashboard sections in the new order, with the clock sections folded in", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(sectionIds(w)).toEqual([
      "section-regions",
      "section-clock-bar-clock",
      "section-clock-bar-layout",
      "section-clock-bar-items",
      "section-appearance",
      "section-kiosk-touch",
      "section-kiosk-touch-focus",
    ]);
    // Screen orientation moved to Screen & keyboard.
    expect(w.find("#section-layout").exists()).toBe(false);
    // the regions editor is embedded and reachable (calvin-4k8 regression fix);
    // redesigned as the full-size ScreenRegionEditor modal launched from this section
    expect(w.findComponent({ name: "ScreenRegionEditor" }).exists()).toBe(true);
  });

  it("names the clock sections Clock, Clock bar layout and Clock bar items", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const eyebrows = w.findAll(".settings-section__eyebrow").map(e => e.text());
    expect(eyebrows).toContain("Clock");
    expect(eyebrows).toContain("Clock bar layout");
    expect(eyebrows).toContain("Clock bar items");
  });

  it("emits update:config for the focus-light mode select", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    // drive the SelectPill bound to focusLightMode via its emitted model event
    const pills = w.findAllComponents({ name: "SelectPill" });
    // find the one wired to focusLightMode by its options (contains 'always')
    const focusPill = pills.find(p => (p.props("options") || []).some(o => o.value === "always"));
    focusPill.vm.$emit("update:modelValue", "always");
    expect(w.emitted("update:config").some(c => c[0].focusLightMode === "always")).toBe(true);
  });

  it("inverts the kiosk toggle (Hide controls → showUI:false)", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const toggles = w.findAllComponents({ name: "ToggleSwitch" });
    // the kiosk row's toggle shows !showUI (=false); toggling emits true → showUI:false
    // Drive every toggle and assert a showUI:false emit appears for the inverted one.
    for (const t of toggles) t.vm.$emit("update:modelValue", true);
    expect(w.emitted("update:config").some(c => c[0].showUI === false)).toBe(true);
  });

  it("splits the touch story into Controls and Touch & focus", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    // Controls: what the wall shows.
    expect(labels).toContain("Hide controls");
    expect(labels).toContain("Keep the clock bar when hidden");
    expect(labels).toContain("Tap anywhere to show controls");
    // Touch & focus: what reacts to touches and which region is active.
    expect(labels).toContain("Touchscreen");
    expect(labels).toContain("Dashboard size");
    expect(labels).toContain("Focus light");
    expect(labels).toContain("Dim other regions");
    expect(labels).not.toContain("Touch controls");
    expect(w.find("#section-kiosk-touch .settings-section__eyebrow").text()).toBe("Controls");
    expect(w.find("#section-kiosk-touch-focus .settings-section__eyebrow").text()).toBe(
      "Touch & focus"
    );
  });

  it("emits clockBarShowInKiosk from the moved keep-clock-bar toggle", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const row = w
      .findAllComponents({ name: "SettingRow" })
      .find(r => r.props("label") === "Keep the clock bar when hidden");
    row.findComponent({ name: "ToggleSwitch" }).vm.$emit("update:modelValue", true);
    expect(w.emitted("update:config").some(c => c[0].clockBarShowInKiosk === true)).toBe(true);
  });
});

// Settings copy audit §3.2 — these strings are verbatim from the spec.
describe("DashboardSettings copy (§3.2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  const COPY = [
    ["Settings text size", "Only changes Settings. The dashboard has its own size below."],
    ["Room name", 'Shown in the clock bar, e.g. "Kitchen".'],
    ["Hide controls", "Hides the ⋯ menu and region headers for a calm wall display."],
    ["Tap anywhere to show controls", "A tap on calendar or photos brings controls back."],
    [
      "Touchscreen",
      "Shows touch buttons: arrows, page dots, the ✕ in fullscreen. Auto works for most screens; choose On if a touch panel acts like a mouse.",
    ],
    ["Dashboard size", "Size of labels and touch buttons on the dashboard."],
    ["Focus light", "Outlines the region the remote or arrow keys will act on."],
    ["Dim other regions", "Dims the rest while the focus light is on."],
  ];

  it.each(COPY)("%s says exactly what it does", (label, description) => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const r = row(w, label);
    expect(r).toBeTruthy();
    expect(r.props("description")).toBe(description);
  });

  const WITHOUT_DESCRIPTION = ["Theme", "Light or dark", "Font", "Keep the clock bar when hidden"];

  it.each(WITHOUT_DESCRIPTION)("%s carries no description", label => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(row(w, label).props("description")).toBe("");
  });

  it("names the theme modes in plain words", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const mode = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Light or dark");
    expect(mode.props("options").map(o => o.label)).toEqual([
      "Light",
      "Dark",
      "Follow device",
      "On a schedule",
    ]);
  });

  it("shows the Dark from hour pickers only on a schedule, and writes whole hours", async () => {
    const auto = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), themeMode: "auto" } },
      global: { stubs },
    });
    expect(auto.findAll('input[type="time"]')).toHaveLength(0);

    const timed = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), themeMode: "time" } },
      global: { stubs },
    });
    const pickers = timed.findAll('input[type="time"]');
    expect(pickers).toHaveLength(2);
    expect(pickers[0].attributes("step")).toBe("3600");

    await pickers[0].setValue("20:00");
    await pickers[1].setValue("07:00");
    const patches = timed.emitted("update:config").map(c => c[0]);
    expect(patches.some(p => p.darkModeStart === 20)).toBe(true);
    expect(patches.some(p => p.darkModeEnd === 7)).toBe(true);
  });

  it("keeps the four corner rows behind Hide controls", () => {
    const shown = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    for (const label of ["Show-controls corner", "Corner visibility", "Corner size", "Hold for"]) {
      expect(row(shown, label)).toBeUndefined();
    }

    const hidden = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), showUI: false } },
      global: { stubs },
    });
    expect(row(hidden, "Show-controls corner").props("description")).toBe(
      "Press and hold this corner to bring hidden controls back."
    );
    expect(row(hidden, "Corner visibility").props("description")).toBe(
      "At 0 it's invisible but still works."
    );
    expect(row(hidden, "Corner size")).toBeTruthy();
    expect(row(hidden, "Hold for")).toBeTruthy();
  });
});

// Settings copy audit §2 — the two per-screen rows.
describe("DashboardSettings per-screen settings (§2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("chips Settings text size and Touchscreen as This screen", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const chips = w.findAll(".setting-scope-chip");
    expect(chips).toHaveLength(2);
    expect(chips.every(c => c.text() === "This screen")).toBe(true);
  });

  it("stores Settings text size in this browser, not on the server", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const size = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Settings text size");
    size.vm.$emit("update:modelValue", "large");
    await flushPromises();

    expect(window.localStorage.getItem("calvin-ui-size")).toBe("large");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.15");
    expect(w.emitted("update:config") || []).not.toContainEqual([{ uiSize: "large" }]);
  });

  it("stores Touchscreen in this browser, not on the server", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const touch = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Touchscreen");
    touch.vm.$emit("update:modelValue", "off");
    await flushPromises();

    expect(window.localStorage.getItem("calvin-touch-controls")).toBe("off");
    expect(w.emitted("update:config") || []).not.toContainEqual([{ touchControls: "off" }]);
  });

  it("reads the server value while this browser has no choice of its own", () => {
    const w = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), touchControls: "on", uiSize: "compact" } },
      global: { stubs },
    });
    const touch = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Touchscreen");
    expect(touch.props("modelValue")).toBe("on");
    const size = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Settings text size");
    expect(size.props("modelValue")).toBe("compact");
  });
});
