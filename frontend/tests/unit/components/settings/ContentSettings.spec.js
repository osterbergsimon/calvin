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

  it("emits both photoFrameEnabled and photoFrameMode when the photo-frame toggle changes", async () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const toggles = wrapper.findAll('[role="switch"]');
    for (const t of toggles) await t.trigger("click");
    const frameEmit = (wrapper.emitted("update:config") || []).find(e =>
      Object.prototype.hasOwnProperty.call(e[0], "photoFrameEnabled")
    );
    expect(frameEmit).toBeTruthy();
    expect(frameEmit[0]).toHaveProperty("photoFrameMode");
  });

  it("reveals the photo-frame start-after choice only when photo-frame mode is on", () => {
    const off = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(off.text()).not.toContain("Start after");
    const on = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true } },
      global: { stubs },
    });
    expect(on.text()).toContain("Start after");
  });

  it("describes the photo frame as the idle mode it is, and starts at 5 min", () => {
    const w = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true, photoFrameTimeout: undefined } },
      global: { stubs },
    });
    expect(w.text()).toContain(
      "After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back."
    );
    const startAfter = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after");
    // Missing config falls back to the store's 300 s, not the old 60 s.
    expect(startAfter.props("modelValue")).toBe(300);
    expect(startAfter.props("options").map(o => o.label)).toEqual([
      "1 min",
      "2 min",
      "5 min",
      "10 min",
      "15 min",
      "30 min",
    ]);
  });

  it("writes the photo-frame start-after in seconds", async () => {
    const w = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true } },
      global: { stubs },
    });
    w.findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Start the photo frame after")
      .vm.$emit("update:modelValue", 600);
    expect(w.emitted("update:config").some(c => c[0].photoFrameTimeout === 600)).toBe(true);
  });

  it("labels the fit options the way a person reads them", () => {
    const w = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const fit = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Fit photos");
    expect(fit.props("options").map(o => o.label)).toEqual([
      "Smart",
      "Whole photo",
      "Fill",
      "Crop",
      "Centre",
    ]);
  });

  it("shows the Smart hint only while Smart is selected", () => {
    const smart = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(smart.text()).toContain("Smart picks Whole photo or Fill per photo.");
    const crop = mount(ContentSettings, {
      props: { config: { ...baseConfig, imageDisplayMode: "crop" } },
      global: { stubs },
    });
    expect(crop.text()).not.toContain("Smart picks Whole photo or Fill per photo.");
  });
});

// Settings copy audit §3.1 — verbatim.
describe("ContentSettings copy (§3.1)", () => {
  const row = (w, label) =>
    w.findAllComponents({ name: "SettingRow" }).find(r => r.props("label") === label);

  const COPY = [
    ["Events per day", 'How many events fit in one day before it shows "+N more".'],
    ["Highlight holidays", "Marks public holidays on the calendar."],
    ["Show week numbers", "Shows the week number at the start of each week."],
    [
      "Photo frame when idle",
      "After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back.",
    ],
    ["Fit photos", "How a photo fills its space."],
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
