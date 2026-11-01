import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ContentSettings from "@/components/settings/categories/ContentSettings.vue";

const stubs = {
  CalendarSourcesTab: true,
  ImagesTab: true,
  ServicesTab: true,
  ClockBarSources: true,
};
const baseConfig = {
  photoRotationInterval: 30,
  imageDisplayMode: "smart",
  randomizeImages: false,
  photoFrameEnabled: false,
  photoFrameMode: false,
  photoFrameTimeout: 60,
  // calendar display (moved here from Display — calvin-svo IA pass)
  weekStartDay: 1,
  weekendDays: [0, 6],
  showWeekNumbers: false,
  timeFormat: "24h",
  maxVisibleEvents: 4,
  showRedDays: false,
};

describe("ContentSettings", () => {
  it("renders one section per thing you see, including clock bar info", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    for (const id of [
      "content-calendars",
      "content-calendar-display",
      "content-photos",
      "content-services",
      "content-clock-bar",
    ]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("puts the photo sources in Photos and names the service section plainly", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const section = wrapper.find("#section-content-services");
    expect(section.exists()).toBe(true);
    expect(section.find(".settings-section__eyebrow").text()).toBe("Web pages & apps");
    expect(
      wrapper.find("#section-content-photos .images-tab-stub, #section-content-photos").exists()
    ).toBe(true);
    expect(wrapper.findComponent({ name: "ImagesTab" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "ServicesTab" }).exists()).toBe(true);
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

  it("points the photo-frame row at its per-screen home instead of editing it", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const row = wrapper
      .findAllComponents({ name: "SettingRow" })
      .find(r => r.props("label") === "Photo frame when idle");
    expect(row).toBeTruthy();
    expect(row.find('[data-test="open-photo-frame-settings"]').exists()).toBe(true);
    // No per-screen value is written from Content any more.
    expect(wrapper.emitted("update:config") || []).not.toContainEqual([
      expect.objectContaining({ photoFrameEnabled: true }),
    ]);
  });

  it("labels Calendar basics without the moved display rows", () => {
    const w = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const section = w.find("#section-content-calendar-display");
    expect(section.find(".settings-section__eyebrow").text()).toBe("Calendar basics");
    const labels = w.findAllComponents({ name: "SettingRow" }).map(r => r.props("label"));
    expect(labels).not.toContain("Show week numbers");
    expect(labels).not.toContain("Events per day");
    expect(labels).not.toContain("Fit photos");
  });

  it("no longer offers Fit photos in Content", () => {
    const w = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const fit = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Fit photos");
    expect(fit).toBeFalsy();
  });
});

// Settings copy audit §3.1 — verbatim.
describe("ContentSettings copy (§3.1)", () => {
  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  const COPY = [
    ["Highlight holidays", "Marks public holidays on the calendar."],
    [
      "Photo frame when idle",
      "Per screen now: choose Off/On, the idle wait and the photo sources in Dashboard › Focus & remote.",
    ],
  ];

  it.each(COPY)("%s says exactly what it does", (label, description) => {
    const w = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true } },
      global: { stubs },
    });
    expect(row(w, label).props("description")).toBe(description);
  });

  it("puts the photo seconds on the control, not in a label", () => {
    const w = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const row_ = row(w, "Show each photo for");
    expect(row_.props("description")).toBe("");
    expect(row_.find(".stepper__value").text()).toBe("30 s");
  });

  it("leaves Shuffle photos undescribed", () => {
    const w = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(row(w, "Shuffle photos").props("description")).toBe("");
  });
});
