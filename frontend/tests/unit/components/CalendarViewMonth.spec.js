import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

// July 2026: the 1st is a Wednesday, so a Monday-start month grid opens on
// June 29 and (at 6 weeks) runs through Aug 9 — a clean case for exercising
// the leading/trailing "other-month" days.
const JULY_15_2026 = new Date(2026, 6, 15);

function mountCalendar(view) {
  const cal = useCalendarStore();
  cal.setCurrentDate(JULY_15_2026);
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
}

describe("CalendarView month view — header + out-of-month dimming", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.events = [];
    cal.sources = [];
    cal.loading = false;
    useConfigStore().showUI = true;
  });

  it("non-rolling month header shows the month name, not a date range", () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 6, days: 7 });
    expect(w.find(".calendar-header__label").text()).toBe("July 2026");
  });

  it("rolling month header keeps a date range (window, not a single month)", () => {
    const w = mountCalendar({ mode: "month", rolling: true, weeks: 4, days: 7 });
    expect(w.find(".calendar-header__label").text()).toContain("-");
  });

  it("non-rolling month marks days outside the anchor month as other-month", async () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 6, days: 7 });
    await w.vm.$nextTick();
    const days = w.vm.calendarDays;
    // Leading day (June 29) is outside July.
    expect(days[0].date.getMonth()).toBe(5); // June
    expect(days[0].otherMonth).toBe(true);
    // A mid-month day (July 15) is inside the anchor month.
    const midJuly = days.find(d => d.date.getMonth() === 6 && d.date.getDate() === 15);
    expect(midJuly.otherMonth).toBe(false);
    // At least one trailing (August) day is dimmed too.
    expect(days.some(d => d.date.getMonth() === 7 && d.otherMonth)).toBe(true);
  });

  it("renders the other-month class on out-of-month cells", async () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 6, days: 7 });
    await w.vm.$nextTick();
    const cells = w.findAll(".calendar-day");
    expect(cells[0].classes()).toContain("other-month");
  });

  it("rolling month never dims cells as other-month (the window IS the view)", async () => {
    const w = mountCalendar({ mode: "month", rolling: true, weeks: 6, days: 7 });
    await w.vm.$nextTick();
    expect(w.vm.calendarDays.every(d => d.otherMonth === false)).toBe(true);
    expect(w.findAll(".calendar-day.other-month").length).toBe(0);
  });

  it("week view never dims cells as other-month", async () => {
    const w = mountCalendar({ mode: "week", rolling: false, weeks: 4, days: 7 });
    await w.vm.$nextTick();
    expect(w.vm.calendarDays.every(d => d.otherMonth === false)).toBe(true);
  });

  it("always shows the whole month even with the old default weeks=4", async () => {
    // July 2026 spans 5 weeks; the count must not clip the tail of the month.
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(35);
    expect(w.vm.calendarDays.some(d => d.date.getMonth() === 6 && d.date.getDate() === 31)).toBe(
      true
    );
  });

  it("extraWeeks appends look-ahead weeks after the month (still labelled by month)", async () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7, extraWeeks: 2 });
    await w.vm.$nextTick();
    // 5 natural weeks + 2 extra = 7 weeks.
    expect(w.findAll(".calendar-day").length).toBe(49);
    // Header still names the month, not the extended range.
    expect(w.find(".calendar-header__label").text()).toBe("July 2026");
    // The appended weeks (August) are outside the month, so dimmed.
    expect(w.vm.calendarDays.some(d => d.date.getMonth() === 7 && d.otherMonth)).toBe(true);
  });
});
