import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ClockSettingsTab from "@/components/settings/tabs/dashboard/ClockSettingsTab.vue";

const baseConfig = {
  orientation: "landscape",
  clockBarMode: "vertical",
  clockBarPosition: "left",
  clockBarLayout: "single-line",
  clockBarFontSize: 16,
  clockBarDateFontSize: 14,
  clockBarPadding: 8,
  clockShowDate: true,
  clockShowSeconds: false,
  clockBarShowInKiosk: true,
  clockBarShowLogo: true,
  clockBarShowWeather: true,
};

describe("ClockSettingsTab", () => {
  function mountTab(configOverrides = {}) {
    return mount(ClockSettingsTab, {
      props: {
        config: { ...baseConfig, ...configOverrides },
      },
      global: {
        stubs: {
          CollapsibleSection: { template: "<section><slot /></section>" },
          SettingItem: { template: "<div><slot /></div>" },
          ClockBarFontSizePicker: true,
        },
      },
    });
  }

  it("shows the weather toggle for vertical clock bars", () => {
    const wrapper = mountTab();

    const weatherToggle = wrapper.find('input[name="clockBarShowWeather"]');
    expect(weatherToggle.exists()).toBe(true);
    expect(weatherToggle.element.checked).toBe(true);
  });

  it("keeps the weather toggle available for horizontal clock bars", () => {
    const wrapper = mountTab({
      clockBarMode: "horizontal",
      clockBarPosition: "top",
    });

    const weatherToggle = wrapper.find('input[name="clockBarShowWeather"]');
    expect(weatherToggle.exists()).toBe(true);
  });
});
