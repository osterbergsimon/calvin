import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DisplaySettings from "@/components/settings/categories/DisplaySettings.vue";

const baseConfig = () => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  selectedTheme: null,
  themeMode: "auto",
  focusLightMode: "interaction",
  focusLightDimOthers: true,
  showUI: true,
  touchControls: "auto",
  touchControlSize: "medium",
  displayName: "",
});

const stubs = { ThemePicker: true, TypefacePicker: true };

describe("DisplaySettings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the focused section set (calendar/notifications/plugin-display moved out — calvin-svo)", () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    ["layout", "regions", "appearance", "kiosk-touch"].forEach(id =>
      expect(w.find(`#section-${id}`).exists()).toBe(true)
    );
    // moved to Content Sources / Device respectively, or removed (meal-plan)
    ["calendar", "notifications", "plugin-display"].forEach(id =>
      expect(w.find(`#section-${id}`).exists()).toBe(false)
    );
    // the regions editor is embedded and reachable (calvin-4k8 regression fix)
    expect(w.findComponent({ name: "DashboardRegionsEditor" }).exists()).toBe(true);
  });

  it("emits update:config for the focus-light mode select", async () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    // drive the SelectPill bound to focusLightMode via its emitted model event
    const pills = w.findAllComponents({ name: "SelectPill" });
    // find the one wired to focusLightMode by its options (contains 'always')
    const focusPill = pills.find(p => (p.props("options") || []).some(o => o.value === "always"));
    focusPill.vm.$emit("update:modelValue", "always");
    expect(w.emitted("update:config").some(c => c[0].focusLightMode === "always")).toBe(true);
  });

  it("inverts the kiosk toggle (Hide controls → showUI:false)", async () => {
    const w = mount(DisplaySettings, { props: { config: baseConfig() }, global: { stubs } });
    const toggles = w.findAllComponents({ name: "ToggleSwitch" });
    // the kiosk row's toggle shows !showUI (=false); toggling emits true → showUI:false
    // Drive every toggle and assert a showUI:false emit appears for the inverted one.
    for (const t of toggles) t.vm.$emit("update:modelValue", true);
    expect(w.emitted("update:config").some(c => c[0].showUI === false)).toBe(true);
  });
});
