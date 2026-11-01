import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardSettings from "@/components/settings/categories/DashboardSettings.vue";
import { useConfigStore } from "@/stores/config";

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
});

const stubs = {
  ThemePicker: true,
  TypefacePicker: true,
  ClockBarFontSizePicker: true,
  ClockBarItemsTab: true,
  KeyboardTab: true,
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

  it("splits the touch story into Controls and Focus & remote", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    // Controls: what the wall shows.
    expect(labels).toContain("Hide controls");
    expect(labels).toContain("Keep the clock bar when hidden");
    expect(labels).toContain("Tap anywhere to show controls");
    // Focus & remote: focus, dashboard size and the remote (decision C).
    expect(labels).toContain("Dashboard size");
    expect(labels).toContain("Focus light");
    expect(labels).toContain("Dim other regions");
    expect(labels).toContain("Show button presses");
    expect(labels).toContain("Label size");
    expect(labels).toContain("Hide label after");
    // Touchscreen moved to Screens › All screens · Touch & keyboard.
    expect(labels).not.toContain("Touchscreen");
    expect(labels).not.toContain("Touch controls");
    expect(w.find("#section-kiosk-touch .settings-section__eyebrow").text()).toBe("Controls");
    expect(w.find("#section-kiosk-touch-focus .settings-section__eyebrow").text()).toBe(
      "Focus & remote"
    );
    expect(w.findComponent({ name: "KeyboardTab" }).exists()).toBe(true);
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
    ["Hide controls", "Hides the ⋯ menu and region headers for a calm wall display."],
    ["Tap anywhere to show controls", "A tap on calendar or photos brings controls back."],
    ["Dashboard size", "Size of labels and touch buttons on the dashboard."],
    ["Focus light", "Outlines the region the remote or arrow keys will act on."],
    ["Dim other regions", "Dims the rest while the focus light is on."],
    [
      "Show button presses",
      "A short label appears when a remote or keyboard button does something.",
    ],
  ];

  it.each(COPY)("%s says exactly what it does", (label, description) => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const r = row(w, label);
    expect(r).toBeTruthy();
    expect(r.props("description")).toBe(description);
  });

  it("has no Room name row (the name is per screen, CLV-84)", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(w.text()).not.toContain("Room name");
    expect(w.find("[aria-label='Room name']").exists()).toBe(false);
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

// Settings copy audit §2 — the per-screen Settings text size row stays here.
// Touchscreen moved to Screens with decision C.
describe("DashboardSettings per-screen settings (§2)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("chips Settings text size as This screen", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const chips = w.findAll(".setting-scope-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toBe("This screen");
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

  it("reads the server value while this browser has no choice of its own", () => {
    const w = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), uiSize: "compact" } },
      global: { stubs },
    });
    const size = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Settings text size");
    expect(size.props("modelValue")).toBe("compact");
  });
});

// calvin-3xz9: Dashboard › Focus & remote › Photo frame, per screen.
describe("DashboardSettings photo frame", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  it("puts Photo frame, Start after and Photos from under Focus & remote", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(row(w, "Photo frame")).toBeTruthy();

    // Off by default, so the dependent rows stay folded away.
    expect(row(w, "Start after")).toBeUndefined();
    expect(row(w, "Photos from")).toBeUndefined();

    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);
    await flushPromises();

    expect(row(w, "Start after")).toBeTruthy();
    expect(row(w, "Photos from")).toBeTruthy();
    expect(w.find("#section-kiosk-touch-focus").text()).toContain("Photo frame");
  });

  it("offers the shared 1–30 minute start-after choices, 5 min by default", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    row(w, "Photo frame")
      .findComponent({ name: "SegmentedControl" })
      .vm.$emit("update:modelValue", true);

    return flushPromises().then(() => {
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
  });

  it("stores the choice on this screen, not in the global config", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
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
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
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

  it("reads the kiosk's merged photo frame but leaves the #256 rows on serverValue", () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hallway");
    const store = useConfigStore();
    // The kiosk's merged config has the photo-frame override ...
    store.photoFrameEnabled = true;
    // ... while the Settings form still holds the global value.
    const w = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), photoFrameEnabled: false, uiSize: "large" } },
      global: { stubs },
    });
    expect(
      row(w, "Photo frame").findComponent({ name: "SegmentedControl" }).props("modelValue")
    ).toBe(true);

    // The existing #256 row keeps following the serverValue it passes in.
    store.uiSize = "compact";
    const size = w
      .findAllComponents({ name: "SegmentedControl" })
      .find(c => c.props("ariaLabel") === "Settings text size");
    expect(size.props("modelValue")).toBe("large");
    window.sessionStorage.clear();
  });

  it("falls back to the old global value until this screen chooses", () => {
    const w = mount(DashboardSettings, {
      props: {
        config: { ...baseConfig(), photoFrameEnabled: true, photoFrameTimeout: 600 },
      },
      global: { stubs },
    });
    const frame = row(w, "Photo frame").findComponent({ name: "SegmentedControl" });
    expect(frame.props("modelValue")).toBe(true);
    const start = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after");
    expect(start.props("modelValue")).toBe(600);
  });
});

// CLV-115: Dashboard › Focus & remote › Loading light, per screen.
describe("DashboardSettings loading light", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const loadingRow = w =>
    w
      .findAll("#section-kiosk-touch-focus .setting-row")
      .find(row => row.text().includes("Loading light"));
  const loadingControl = w =>
    w
      .findAllComponents({ name: "SegmentedControl" })
      .find(
        c =>
          c.props("ariaLabel") === "Loading light" || c.attributes("aria-label") === "Loading light"
      );

  it("offers Comet · Pulse · Off under Focus & remote, Comet by default", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const row = loadingRow(w);
    expect(row).toBeTruthy();
    expect(row.text()).toContain("What Calvin shows while it's fetching something.");
    const control = loadingControl(w);
    expect(control.props("options").map(o => o.label)).toEqual(["Comet", "Pulse", "Off"]);
    expect(control.props("modelValue")).toBe("comet");
    expect(row.text()).toContain("Same as Default");
  });

  it("shows the Default value until this screen picks its own", () => {
    const w = mount(DashboardSettings, {
      props: { config: { ...baseConfig(), loadingLight: "off" } },
      global: { stubs },
    });
    expect(loadingControl(w).props("modelValue")).toBe("off");
  });

  it("a choice applies to this screen only, then resets to the Default", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    loadingControl(w).vm.$emit("update:modelValue", "pulse");
    await flushPromises();

    expect(localStorage.getItem("calvin-screen-loadingLight")).toBe("pulse");
    expect((w.emitted("update:config") || []).some(c => "loadingLight" in c[0])).toBe(false);
    expect(loadingControl(w).props("modelValue")).toBe("pulse");
    expect(loadingRow(w).text()).toContain("Changed here");

    await w.find('[data-test="reset-loading-light"]').trigger("click");
    await flushPromises();
    expect(localStorage.getItem("calvin-screen-loadingLight")).toBeNull();
    expect(loadingControl(w).props("modelValue")).toBe("comet");
    expect(loadingRow(w).text()).toContain("Same as Default");
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
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(loadingRow(w).text()).toContain("This device prefers less motion, so it pulses.");
  });

  it("does not mention reduced motion otherwise", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(loadingRow(w).text()).not.toContain("prefers less motion");
  });
});
