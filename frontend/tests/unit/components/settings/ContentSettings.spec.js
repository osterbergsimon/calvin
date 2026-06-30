import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ContentSettings from "@/components/settings/categories/ContentSettings.vue";

const stubs = { CalendarSourcesTab: true, ImagesTab: true, ServicesTab: true };
const baseConfig = {
  photoRotationInterval: 30,
  imageDisplayMode: "smart",
  randomizeImages: false,
  photoFrameEnabled: false,
  photoFrameMode: false,
  photoFrameTimeout: 60,
  // calendar display (moved here from Display — calvin-svo IA pass)
  calendarViewMode: "month",
  calendarWeeks: 4,
  weekStartDay: 1,
  weekendDays: [0, 6],
  showWeekNumbers: false,
  timeFormat: "24h",
  maxVisibleEvents: 4,
  showRedDays: false,
};

describe("ContentSettings", () => {
  it("renders the five sections incl. the moved calendar-display", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    for (const id of [
      "content-calendars",
      "content-calendar-display",
      "content-photos",
      "content-images",
      "content-services",
    ]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("emits update:config when a weekend-day chip is toggled (calendar display)", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const chips = wrapper.findComponent({ name: "ChipMultiSelect" });
    expect(chips.exists()).toBe(true);
    chips.vm.$emit("update:modelValue", [0]);
    expect(
      wrapper
        .emitted("update:config")
        .some(c => Array.isArray(c[0].weekendDays) && c[0].weekendDays.join() === "0")
    ).toBe(true);
  });

  it("emits update:config when Randomize image order toggles", async () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    // The Randomize toggle is the ToggleSwitch whose row carries that label.
    const toggles = wrapper.findAll('[role="switch"]');
    // randomizeImages is the 2nd toggle (photo-frame is the 1st-or-2nd depending on order);
    // assert at least one toggle emits a randomizeImages patch when clicked.
    let sawRandomize = false;
    for (const t of toggles) {
      await t.trigger("click");
    }
    for (const e of wrapper.emitted("update:config") || []) {
      if (Object.prototype.hasOwnProperty.call(e[0], "randomizeImages")) sawRandomize = true;
    }
    expect(sawRandomize).toBe(true);
  });

  it("emits both photoFrameEnabled and photoFrameMode when the photo-frame toggle changes", async () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const toggles = wrapper.findAll('[role="switch"]');
    for (const t of toggles) await t.trigger("click");
    const frameEmit = (wrapper.emitted("update:config") || []).find(
      e => Object.prototype.hasOwnProperty.call(e[0], "photoFrameEnabled")
    );
    expect(frameEmit).toBeTruthy();
    expect(frameEmit[0]).toHaveProperty("photoFrameMode");
  });

  it("reveals the photo-frame timeout only when photo-frame mode is on", () => {
    const off = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(off.text()).not.toContain("Photo-frame timeout");
    const on = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true } },
      global: { stubs },
    });
    expect(on.text()).toContain("Photo-frame timeout");
  });
});
