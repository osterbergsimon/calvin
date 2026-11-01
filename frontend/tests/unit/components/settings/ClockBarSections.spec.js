import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClockBarSections from "@/components/settings/categories/ClockBarSections.vue";

const stubs = { ClockBarSizePicker: true, ClockBarPreview: true, ClockBarItemsTab: true };

const baseConfig = {
  clockShowDate: true,
  clockShowSeconds: false,
  clockBarShowLogo: true,
  clockBarShowPluginItems: true,
  clockBarShowInKiosk: false,
  clockBarLayout: "single-line",
  clockBarVerticalLayout: "upright",
  clockBarFontSize: 16,
  clockBarDateFontSize: 14,
  clockBarPadding: 8,
  clockBarVerticalFontSize: 18,
  clockBarVerticalDateFontSize: 11,
  clockBarVerticalPadding: 8,
};

describe("ClockBarSections", () => {
  it("renders the three clock sections with their new titles", () => {
    const wrapper = mount(ClockBarSections, { props: { config: baseConfig }, global: { stubs } });
    expect(wrapper.find("#section-clock-bar-clock").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-layout").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-items").exists()).toBe(true);

    expect(wrapper.findAll(".settings-section__eyebrow").map(e => e.text())).toEqual([
      "Clock",
      "Clock bar layout",
      "Clock bar items",
    ]);
  });

  it("emits update:config when a clock toggle changes", async () => {
    const wrapper = mount(ClockBarSections, { props: { config: baseConfig }, global: { stubs } });
    await wrapper.findAll('[role="switch"]')[0].trigger("click");
    const emitted = wrapper.emitted("update:config");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toHaveProperty("clockShowDate");
  });

  it("drops the global Show plugin info row (decision C)", () => {
    // Each tile is switched on/off in Clock bar items, so the master toggle only
    // duplicated them — and left no control to bring tiles back if it was off.
    const wrapper = mount(ClockBarSections, { props: { config: baseConfig }, global: { stubs } });
    const labels = wrapper
      .findAll(".setting-row__label, .settings-row__label")
      .map(el => el.text());
    expect(labels.join(" ")).not.toContain("Show plugin info");
    expect(wrapper.text()).not.toContain("Show plugin info");
    expect(wrapper.text()).not.toContain("plugin readouts");
  });

  it("writes a size preset through to the stored clock bar keys", async () => {
    const wrapper = mount(ClockBarSections, { props: { config: baseConfig }, global: { stubs } });
    const [horizontal, vertical] = wrapper.findAllComponents({ name: "ClockBarSizePicker" });

    horizontal.vm.$emit("update", { time: 24, date: 18, padding: 12, plugin: 20 });
    vertical.vm.$emit("update", { time: 28 });

    const patches = wrapper.emitted("update:config").map(call => call[0]);
    expect(patches).toContainEqual({
      clockBarFontSize: 24,
      clockBarDateFontSize: 18,
      clockBarPadding: 12,
      clockBarPluginItemSize: 20,
    });
    expect(patches).toContainEqual({ clockBarVerticalFontSize: 28 });
  });

  it("keeps one live preview under the layout section", () => {
    const wrapper = mount(ClockBarSections, { props: { config: baseConfig }, global: { stubs } });
    expect(
      wrapper.find("#section-clock-bar-layout").findComponent({ name: "ClockBarPreview" }).exists()
    ).toBe(true);
  });
});
