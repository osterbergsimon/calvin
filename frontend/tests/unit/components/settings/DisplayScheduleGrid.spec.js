import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";

const schedule = [
  { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 1, enabled: false, onTime: "06:00", offTime: "22:00" },
];

describe("DisplayScheduleGrid", () => {
  it("renders a row per day and emits update:modelValue when a day toggles", async () => {
    const wrapper = mount(DisplayScheduleGrid, { props: { modelValue: schedule } });
    const days = wrapper.findAll(".schedule-day");
    expect(days.length).toBe(2);

    await wrapper.findAll(".schedule-day input[type='checkbox']")[1].setValue(true);
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted.at(-1)[0][1].enabled).toBe(true);
  });

  it("emits when an on-time changes", async () => {
    const wrapper = mount(DisplayScheduleGrid, { props: { modelValue: schedule } });
    const onInput = wrapper.find(".schedule-day input[type='time']");
    await onInput.setValue("07:30");
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted.at(-1)[0][0].onTime).toBe("07:30");
  });
});
