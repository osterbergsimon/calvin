import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScreenInspector from "@/components/settings/shared/regions/ScreenInspector.vue";

const screen = {
  name: "Home",
  layout: { preset: "single", regions: [{ id: "r1", kind: "calendar", size: 100 }] },
};
const clock = { enabled: true, position: "top" };

const mountWith = (props = {}) =>
  mount(ScreenInspector, {
    props: { screen, layoutDir: "row", clock, ...props },
    global: {
      stubs: { SegmentedControl: true, ToggleSwitch: true, SelectPill: true },
    },
  });

describe("ScreenInspector doctrine rows (CLV-87)", () => {
  it("keeps the clock-bar toggle on the right of its label", () => {
    const w = mountWith();
    const row = w
      .findAllComponents({ name: "SettingRow" })
      .find(candidate => candidate.findAllComponents({ name: "ToggleSwitch" }).length > 0);
    expect(row.classes()).toContain("ins-toggle-row");
  });

  it("hides its heading when the phone sheet supplies one", () => {
    expect(mountWith().find(".ins-mode").exists()).toBe(true);
    expect(mountWith({ hideHeading: true }).find(".ins-mode").exists()).toBe(false);
  });
});
