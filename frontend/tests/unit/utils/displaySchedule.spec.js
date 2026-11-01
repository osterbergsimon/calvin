import { describe, it, expect } from "vitest";
import {
  SCHEDULE_DAYS,
  applyScheduleMode,
  formatScheduleSummary,
  inferScheduleMode,
  normalizeSchedule,
  scheduleRows,
} from "@/utils/displaySchedule";

const week = (on, off, enabled = true) =>
  SCHEDULE_DAYS.map((_, day) => ({ day, enabled, onTime: on, offTime: off }));

const byDay = (...entries) =>
  entries.map(([day, enabled, onTime, offTime]) => ({ day, enabled, onTime, offTime }));

describe("displaySchedule", () => {
  it("normalizes a partial array to the seven Python weekday entries", () => {
    const schedule = normalizeSchedule([{ day: 2, enabled: false, onTime: "08:00", offTime: "23:00" }]);
    expect(schedule).toHaveLength(7);
    expect(schedule.map(day => day.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(schedule[2]).toMatchObject({ enabled: false, onTime: "08:00", offTime: "23:00" });
    expect(schedule[0]).toMatchObject({ enabled: true, onTime: "06:00", offTime: "22:00" });
  });

  it("infers every day from seven equal enabled days", () => {
    expect(inferScheduleMode(week("06:00", "22:00"))).toBe("every-day");
  });

  it("infers weekdays and weekends from two equal groups", () => {
    const schedule = week("06:00", "22:00");
    for (const day of [5, 6]) {
      schedule[day].onTime = "08:00";
      schedule[day].offTime = "23:00";
    }
    expect(inferScheduleMode(schedule)).toBe("weekdays");
  });

  it("infers weekdays and weekends when both groups are off all day", () => {
    const schedule = week("06:00", "22:00", false);
    expect(inferScheduleMode(schedule)).toBe("weekdays");
  });

  it("infers each day from mixed days", () => {
    const schedule = week("06:00", "22:00");
    schedule[5].onTime = "08:00";
    expect(inferScheduleMode(schedule)).toBe("each-day");
  });

  it("copies the first row to every day when switching to every day", () => {
    const schedule = week("06:00", "22:00");
    schedule[3] = { day: 3, enabled: false, onTime: "09:00", offTime: "23:30" };
    const next = applyScheduleMode(schedule, "every-day");
    expect(next.every(day => day.enabled && day.onTime === "06:00" && day.offTime === "22:00")).toBe(
      true
    );
    expect(next.map(day => day.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("copies Monday to Mon–Fri and Saturday to Sat–Sun when switching to weekdays", () => {
    const schedule = week("06:00", "22:00");
    schedule[0] = { day: 0, enabled: true, onTime: "05:30", offTime: "21:00" };
    schedule[5] = { day: 5, enabled: false, onTime: "08:00", offTime: "23:00" };
    const next = applyScheduleMode(schedule, "weekdays");
    expect(next.slice(0, 5).map(day => [day.enabled, day.onTime, day.offTime])).toEqual(
      Array(5).fill([true, "05:30", "21:00"])
    );
    expect(next.slice(5).map(day => [day.enabled, day.onTime, day.offTime])).toEqual(
      Array(2).fill([false, "08:00", "23:00"])
    );
  });

  it("keeps the values when switching to each day", () => {
    const schedule = week("06:00", "22:00");
    expect(applyScheduleMode(schedule, "each-day")).toEqual(schedule);
  });

  it("lists the seven days from the configured week start", () => {
    expect(scheduleRows(normalizeSchedule([]), "each-day", 1).map(row => row.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(scheduleRows(normalizeSchedule([]), "each-day", 0).map(row => row.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("groups the weekdays and the weekend", () => {
    const rows = scheduleRows(normalizeSchedule([]), "weekdays", 1);
    expect(rows.map(row => [row.label, row.days])).toEqual([
      ["Mon–Fri", [0, 1, 2, 3, 4]],
      ["Sat–Sun", [5, 6]],
    ]);
    expect(scheduleRows(normalizeSchedule([]), "every-day", 1)).toHaveLength(1);
  });

  describe("summary", () => {
    it("summarises seven equal days", () => {
      expect(formatScheduleSummary(week("06:00", "22:00"))).toBe("On 06:00 · off 22:00, every day");
    });

    it("summarises a weekday and weekend split", () => {
      const schedule = applyScheduleMode(week("06:00", "22:00"), "weekdays");
      schedule[5].onTime = "08:00";
      schedule[5].offTime = "23:00";
      schedule[6].onTime = "08:00";
      schedule[6].offTime = "23:00";
      expect(formatScheduleSummary(schedule)).toBe(
        "Weekdays 06:00–22:00 · weekends 08:00–23:00"
      );
    });

    it("says the schedule is different each day, and names days that are off", () => {
      const schedule = week("06:00", "22:00");
      schedule[5].offTime = "23:30";
      schedule[6].enabled = false;
      expect(formatScheduleSummary(schedule)).toBe("Different each day · Off on Sundays");
    });

    it("summarises an overnight range", () => {
      expect(formatScheduleSummary(week("22:00", "06:00"))).toBe(
        "On 22:00 · off 06:00 the next day"
      );
    });

    it("uses the user's time format", () => {
      expect(formatScheduleSummary(week("06:00", "22:00"), { timeFormat: "12h" })).toBe(
        "On 6:00 AM · off 10:00 PM, every day"
      );
    });

    it("says off every day when no day is on", () => {
      expect(formatScheduleSummary(week("06:00", "22:00", false))).toBe("Off every day");
    });
  });
});
