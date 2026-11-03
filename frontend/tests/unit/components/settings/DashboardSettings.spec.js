import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
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
  uiSize: "default",
});

const stubs = {
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

  it("renders what the home shows, with the clock sections folded in", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(sectionIds(w)).toEqual([
      "section-regions",
      "section-clock-bar-clock",
      "section-clock-bar-layout",
      "section-clock-bar-items",
      "section-kiosk-touch-focus",
    ]);
    // Appearance moved to Screens › Look (§7 item 6).
    expect(w.find("#section-appearance").exists()).toBe(false);
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

  it("leaves only the remote rows and points to Screens for the rest", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    // Remote buttons: key-press labels and bindings are what is left.
    expect(labels).toContain("Hide label after");
    // Everything that moved lives on Screens now.
    for (const label of [
      "Look",
      "Theme",
      "Light or dark",
      "Font",
      "Settings text size",
      "Dashboard size",
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
    expect(w.find("#section-kiosk-touch-focus .settings-section__eyebrow").text()).toBe(
      "Remote buttons"
    );
    expect(w.findComponent({ name: "KeyboardTab" }).exists()).toBe(true);
  });

  it("leaves a true signpost where the moved groups used to be", async () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const signpost = w.find("[data-test='dashboard-screen-signpost']");
    expect(signpost.exists()).toBe(true);
    expect(signpost.text()).toContain("Look, focus light and controls are set per screen.");
    const open = signpost.find("[data-test='open-screens-settings']");
    expect(open.exists()).toBe(true);
    expect(open.text()).toBe("Open Screens");

    await open.trigger("click");
    expect(push).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "dashboard-kiosk" },
    });
  });

  it("no longer has any per-screen row or this-screen chip", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(w.findAll(".setting-scope-chip")).toHaveLength(0);
    expect(w.findComponent({ name: "ThemePicker" }).exists()).toBe(false);
    expect(w.findComponent({ name: "TypefacePicker" }).exists()).toBe(false);
    expect(w.findComponent({ name: "SegmentedControl" }).exists()).toBe(false);
  });

  it("has no Room name row (the name is per screen, CLV-84)", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    expect(w.text()).not.toContain("Room name");
    expect(w.find("[aria-label='Room name']").exists()).toBe(false);
  });
});
