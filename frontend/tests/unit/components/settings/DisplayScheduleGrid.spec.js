import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import FieldTable from "@/components/ui/FieldTable.vue";

const week = (on, off, enabled = true) =>
  [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, enabled, onTime: on, offTime: off }));

const mountGrid = (modelValue, props = {}) =>
  mount(DisplayScheduleGrid, { props: { modelValue, ...props } });

const summary = wrapper => wrapper.find('[data-test="schedule-summary"]').text();

describe("DisplayScheduleGrid", () => {
  it("summarises seven equal days in one row with a Change button", () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    expect(summary(wrapper)).toBe("On 06:00 · off 22:00, every day");
    expect(wrapper.find('[data-test="schedule-change"]').text()).toBe("Change");
    expect(wrapper.findComponent(FieldTable).exists()).toBe(false);
  });

  it("summarises a weekday and weekend split", () => {
    const schedule = week("06:00", "22:00");
    for (const day of [5, 6]) {
      schedule[day].onTime = "08:00";
      schedule[day].offTime = "23:00";
    }
    expect(summary(mountGrid(schedule))).toBe(
      "Weekdays 06:00–22:00 · weekends 08:00–23:00"
    );
  });

  it("names an off day when every day differs", () => {
    const schedule = week("06:00", "22:00");
    schedule[5].offTime = "23:30";
    schedule[6].enabled = false;
    expect(summary(mountGrid(schedule))).toBe("Different each day · Off on Sundays");
  });

  it("follows the 12-hour setting", () => {
    expect(summary(mountGrid(week("06:00", "22:00"), { timeFormat: "12h" }))).toBe(
      "On 6:00 AM · off 10:00 PM, every day"
    );
  });

  it("summarises an overnight schedule", () => {
    expect(summary(mountGrid(week("22:00", "06:00")))).toBe(
      "On 22:00 · off 06:00 the next day"
    );
  });

  it("expands a full-width editor with one header row and Done collapses it", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");

    expect(wrapper.findComponent(FieldTable).exists()).toBe(true);
    expect(wrapper.findAll('[data-test="field-table-head"]')).toHaveLength(1);
    expect(wrapper.find(".setting-row__control").findComponent(FieldTable).exists()).toBe(false);
    expect(wrapper.find("[aria-label='How it repeats']").exists()).toBe(true);
    expect(wrapper.find('[data-test="schedule-change"]').text()).toBe("Done");

    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    expect(wrapper.findComponent(FieldTable).exists()).toBe(false);
  });

  it("shows one row for Every day, two for weekdays and seven for Each day", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    const labels = () => wrapper.findAll(".field-table__label").map(el => el.text());
    expect(labels()).toEqual(["Every day"]);

    const segmented = wrapper.findComponent({ name: "SegmentedControl" });
    segmented.vm.$emit("update:modelValue", "weekdays");
    await wrapper.vm.$nextTick();
    expect(labels()).toEqual(["Mon–Fri", "Sat–Sun"]);

    segmented.vm.$emit("update:modelValue", "each-day");
    await wrapper.vm.$nextTick();
    expect(labels()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("orders the days from the configured week start", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"), { weekStart: 0 });
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "each-day");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".field-table__label").map(el => el.text())).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("copies the first row to every day when switching to Every day", async () => {
    const schedule = week("06:00", "22:00");
    schedule[3] = { day: 3, enabled: false, onTime: "09:00", offTime: "23:30" };
    const wrapper = mountGrid(schedule);
    await wrapper.find('[data-test="schedule-change"]').trigger("click");

    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "every-day");
    await wrapper.vm.$nextTick();

    const emitted = wrapper.emitted("update:modelValue").at(-1)[0];
    expect(emitted.every(day => day.enabled && day.onTime === "06:00" && day.offTime === "22:00")).toBe(
      true
    );
  });

  it("writes a grouped row to every day in its group", async () => {
    const schedule = week("06:00", "22:00");
    for (const day of [5, 6]) {
      schedule[day].onTime = "08:00";
      schedule[day].offTime = "23:00";
    }
    const wrapper = mountGrid(schedule);
    await wrapper.find('[data-test="schedule-change"]').trigger("click");

    const timeInputs = wrapper.findAll("input[type='time']");
    // Mon–Fri on, Mon–Fri off, Sat–Sun on, Sat–Sun off
    await timeInputs[0].setValue("05:30");
    const emitted = wrapper.emitted("update:modelValue").at(-1)[0];
    expect(emitted.slice(0, 5).every(day => day.onTime === "05:30")).toBe(true);
    expect(emitted[5].onTime).toBe("08:00");
  });

  it("turning a day off hides its times, saves enabled: false and reads Off all day", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "each-day");
    await wrapper.vm.$nextTick();

    const monday = wrapper.findAll(".field-table__row")[0];
    expect(monday.findAll("input[type='time']")).toHaveLength(2);
    await monday.find('[role="switch"]').trigger("click");

    expect(monday.findAll("input[type='time']")).toHaveLength(0);
    expect(monday.text()).toContain("Off all day");
    expect(wrapper.emitted("update:modelValue").at(-1)[0][0].enabled).toBe(false);
  });

  it("names each field and toggle for its day", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "each-day");
    await wrapper.vm.$nextTick();

    const monday = wrapper.findAll(".field-table__row")[0];
    const times = monday.findAll("input[type='time']");
    expect(times).toHaveLength(2);
    const labelFor = id => monday.find(`label[for="${id}"]`).text();
    expect(labelFor(times[0].attributes("id"))).toBe("Monday on");
    expect(labelFor(times[1].attributes("id"))).toBe("Monday off");
    expect(monday.find('[role="switch"]').attributes("aria-label")).toBe("Screen on, Monday");
  });

  it("shows an error when on and off are the same time", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    const timeInputs = wrapper.findAll("input[type='time']");
    await timeInputs[1].setValue("06:00");
    expect(wrapper.text()).toContain("On and off can't be the same time.");
  });

  it("shows the scope line under the summary and emits reset", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"), {
      showScope: true,
      overridden: true,
      resetTest: "reset-daily-schedule",
    });
    expect(wrapper.find(".setting-row__desc").text()).toContain("Changed here");
    await wrapper.find('[data-test="reset-daily-schedule"]').trigger("click");
    expect(wrapper.emitted("reset")).toHaveLength(1);
  });

  it("infers the mode again when the editor closes", async () => {
    const wrapper = mountGrid(week("06:00", "22:00"));
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "each-day");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: "SegmentedControl" }).props("modelValue")).toBe("each-day");

    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    await wrapper.find('[data-test="schedule-change"]').trigger("click");
    expect(wrapper.findComponent({ name: "SegmentedControl" }).props("modelValue")).toBe(
      "every-day"
    );
  });
});
