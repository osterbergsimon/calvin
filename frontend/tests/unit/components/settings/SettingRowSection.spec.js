import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("SettingRow is side-by-side by default and stacks full-width when stacked", () => {
    const beside = mount(SettingRow, { props: { label: "A" }, slots: { default: "<i>c</i>" } });
    expect(beside.find(".setting-row").classes()).not.toContain("setting-row--stacked");

    const stacked = mount(SettingRow, {
      props: { label: "A", stacked: true },
      slots: { default: "<i>c</i>" },
    });
    expect(stacked.find(".setting-row").classes()).toContain("setting-row--stacked");
  });
  it("SettingRow drops the panel inset when it sits in a dialog body", () => {
    const w = mount(SettingRow, {
      props: { label: "A", flush: true },
      slots: { default: "<i>c</i>" },
    });
    const row = w.find(".setting-row");
    expect(row.classes()).toContain("setting-row--flush");
    expect(row.classes()).not.toContain("setting-row--stacked");
  });
  it("wraps a slot description in the row's description style", () => {
    const w = mount(SettingRow, {
      props: { label: "Schedule" },
      slots: { description: "<span>On 06:00 · off 22:00, every day</span>" },
    });
    expect(w.find(".setting-row__desc").text()).toBe("On 06:00 · off 22:00, every day");
  });

  it("keeps the control beside the label: only the phone and :stacked stack it", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../../src/components/settings/shell/SettingRow.vue"),
      "utf-8"
    );
    expect(source).toMatch(/\.setting-row \{[^}]*flex-wrap: nowrap/);
    expect(source).toMatch(/@media \(--bp-phone\)[\s\S]*?flex-wrap: wrap/);
    // The control's own width never decides the layout.
    expect(source).not.toMatch(/\.setting-row__control \{[^}]*flex: 1/);
  });

  it("SettingsSection renders an eyebrow title and exposes its id", () => {
    const w = mount(SettingsSection, {
      props: { id: "layout", title: "Layout" },
      slots: { default: "<p>rows</p>" },
    });
    expect(w.find(".settings-section").attributes("id")).toBe("section-layout");
    expect(w.find(".settings-section__eyebrow").text()).toBe("Layout");
  });
  it("SettingsSection shows an optional panel intro above the rows", () => {
    const w = mount(SettingsSection, {
      props: { id: "keys", title: "API keys", description: "What these keys are for." },
      slots: { default: "<p>rows</p>" },
    });
    expect(w.find(".settings-section__intro").text()).toBe("What these keys are for.");
  });
});
