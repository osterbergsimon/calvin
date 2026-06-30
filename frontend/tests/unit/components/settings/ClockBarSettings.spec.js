import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClockBarSettings from "@/components/settings/categories/ClockBarSettings.vue";

const stubs = { ClockBarFontSizePicker: true, ClockBarItemsTab: true };

const baseConfig = {
  clockShowDate: true,
  clockShowSeconds: false,
  clockBarShowLogo: true,
  clockBarShowWeather: false,
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

describe("ClockBarSettings", () => {
  it("renders the three sections", () => {
    const wrapper = mount(ClockBarSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(wrapper.find("#section-clock-bar-clock").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-layout").exists()).toBe(true);
    expect(wrapper.find("#section-clock-bar-items").exists()).toBe(true);
  });

  it("emits update:config when a clock toggle changes", async () => {
    const wrapper = mount(ClockBarSettings, { props: { config: baseConfig }, global: { stubs } });
    await wrapper.findAll('[role="switch"]')[0].trigger("click");
    const emitted = wrapper.emitted("update:config");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toHaveProperty("clockShowDate");
  });
});
