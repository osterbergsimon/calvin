import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DashboardSettings from "@/components/settings/categories/DashboardSettings.vue";

const baseConfig = () => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  selectedTheme: null,
  themeMode: "auto",
  focusLightMode: "interaction",
  focusLightDimOthers: true,
  showUI: true,
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

  it("co-locates the touch story under Touch & controls", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    expect(labels).toContain("Keep clock bar visible");
    expect(labels).toContain("Focus light");
    // "controls" overload resolved: the touch-capability row is now "Touchscreen"
    expect(labels).toContain("Touchscreen");
    expect(labels).not.toContain("Touch controls");
    expect(w.find("#section-kiosk-touch .settings-section__eyebrow").text()).toBe(
      "Touch & controls"
    );
  });

  it("emits clockBarShowInKiosk from the moved keep-clock-bar toggle", () => {
    const w = mount(DashboardSettings, { props: { config: baseConfig() }, global: { stubs } });
    const row = w
      .findAllComponents({ name: "SettingRow" })
      .find(r => r.props("label") === "Keep clock bar visible");
    row.findComponent({ name: "ToggleSwitch" }).vm.$emit("update:modelValue", true);
    expect(w.emitted("update:config").some(c => c[0].clockBarShowInKiosk === true)).toBe(true);
  });
});
