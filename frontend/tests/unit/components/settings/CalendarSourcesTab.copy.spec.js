import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";

// Settings copy audit §3.1: the calendar refresh row speaks about events, and
// its unit lives on the control instead of in the description.
describe("CalendarSourcesTab · check for new events", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const mountWith = config =>
    mount(CalendarSourcesTab, { props: { config: { calendarRefreshInterval: 30, ...config } } });

  const refreshRow = w =>
    w
      .findAllComponents({ name: "SettingRow" })
      .find(r => r.props("label") === "Check for new events every");

  it("labels the row and leaves the minutes to the control", () => {
    const w = mountWith();
    const row = refreshRow(w);
    expect(row).toBeTruthy();
    expect(row.props("description")).toBe("");
    expect(w.find(".stepper__value").text()).toBe("30 min");
  });

  it("still saves minutes to the server key", () => {
    const w = mountWith();
    w.findComponent({ name: "NumberStepper" }).vm.$emit("update:modelValue", 60);
    expect(w.emitted("update:config")).toContainEqual([{ calendarRefreshInterval: 60 }]);
  });
});
