import { describe, it, expect, beforeEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardSettings from "@/components/settings/categories/DashboardSettings.vue";

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push }),
}));

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
  ClockBarSizePicker: true,
  ClockBarPreview: true,
  ClockBarItemsTab: true,
  KeyboardTab: true,
};

const sectionIds = wrapper =>
  wrapper.findAll("section.settings-section").map(section => section.attributes("id"));

describe("DashboardSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("renders the dashboard sections in the new order, with the clock sections folded in", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(sectionIds(w)).toEqual([
      "section-regions",
      "section-clock-bar-clock",
      "section-clock-bar-layout",
      "section-clock-bar-items",
      "section-appearance",
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

  it("emits update:config for the Dashboard size select", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const pills = w.findAllComponents({ name: "SelectPill" });
    const sizePill = pills.find(p => p.props("ariaLabel") === "Dashboard size");
    sizePill.vm.$emit("update:modelValue", "large");
    expect(w.emitted("update:config").some(c => c[0].touchControlSize === "large")).toBe(true);
  });

  it("leaves only the remote rows in Dashboard and points to Screens for the rest", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    // Remote buttons: the size left behind for now, key-press labels and bindings.
    expect(labels).toContain("Dashboard size");
    expect(labels).toContain("Hide label after");
    // The moved rows are gone (settings-scope §7 item 4).
    for (const label of [
      "Hide controls",
      "Keep the clock bar when hidden",
      "Tap anywhere to show controls",
      "Focus light",
      "Dim other regions",
      "Show button presses",
      "Label size",
    ]) {
      expect(labels, label).not.toContain(label);
    }
    expect(w.find("#section-kiosk-touch").exists()).toBe(false);
    expect(w.find("#section-kiosk-touch-focus .settings-section__eyebrow").text()).toBe(
      "Remote buttons"
    );
    expect(w.findComponent({ name: "KeyboardTab" }).exists()).toBe(true);
  });

  it("leaves a signpost where the moved groups used to be", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const signpost = w.find("[data-test='dashboard-screen-signpost']");
    expect(signpost.exists()).toBe(true);
    expect(signpost.text()).toContain("Focus light and controls are set per screen.");
    const open = signpost.find("[data-test='open-screens-settings']");
    expect(open.exists()).toBe(true);
    expect(open.text()).toBe("Open Screens");

    await open.trigger("click");
    expect(push).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "dashboard-kiosk" },
    });
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
    ["Dashboard size", "Size of labels and touch buttons on the dashboard."],
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

  const WITHOUT_DESCRIPTION = ["Theme", "Light or dark", "Font"];

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
});

// Settings copy audit §2 — the per-screen Settings text size row stays here,
// and the three Controls rows became per-screen too (calvin-hi6w).
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
    expect(chips.every(chip => chip.text() === "This screen")).toBe(true);
  });

  it("no longer has a This-screen focus light style row (moved to Screens, calvin-uudb)", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(w.text()).not.toContain("Focus light style");
    expect(w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"))).not.toContain(
      "Focus light style"
    );
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
