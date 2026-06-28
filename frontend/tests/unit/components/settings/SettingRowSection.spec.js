import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

describe("SettingRow + SettingsSection", () => {
  it("SettingRow renders label, description and the control slot", () => {
    const w = mount(SettingRow, {
      props: { label: "Orientation", description: "How panels arrange." },
      slots: { default: "<button class='ctl'>x</button>" },
    });
    expect(w.find(".setting-row__label").text()).toBe("Orientation");
    expect(w.find(".setting-row__desc").text()).toBe("How panels arrange.");
    expect(w.find(".setting-row__control .ctl").exists()).toBe(true);
  });
  it("SettingsSection renders an eyebrow title and exposes its id", () => {
    const w = mount(SettingsSection, { props: { id: "layout", title: "Layout" }, slots: { default: "<p>rows</p>" } });
    expect(w.find(".settings-section").attributes("id")).toBe("section-layout");
    expect(w.find(".settings-section__eyebrow").text()).toBe("Layout");
  });
});
