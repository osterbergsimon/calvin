/**
 * Week-agenda strip identity across window shifts (calvin-sb9j).
 *
 * The rolling week layout is a per-day chip grid (not the month ribbon band).
 * Its day cells are already keyed by date, but chips used to include the event's
 * position in the key, so inserting an event remounted every later chip. The
 * strip must key chips by date + event id (plus an occurrence only for duplicate
 * ids), and keep day/header/chip elements when the window shifts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

const JULY_15_2026 = new Date(2026, 6, 15);

const ROLLING_WEEK_7 = { mode: "week", rolling: true, weeks: 4, days: 7 };
const ROLLING_WEEK_14 = { mode: "week", rolling: true, weeks: 4, days: 14 };

const dateKey = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const event = (id, title, date, hour) => ({
  id,
  title,
  start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0).toISOString(),
  end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, 0).toISOString(),
  all_day: false,
  source: "s1",
});

function mountCalendar(view) {
  const cal = useCalendarStore();
  cal.setCurrentDate(new Date(JULY_15_2026));
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
}

function setEvents(events) {
  const cal = useCalendarStore();
  cal.events = events;
  cal.eventsBySourceKey["__all__"] = events;
}

function indexOfDate(wrapper, date) {
  return wrapper.vm.calendarDays.findIndex(d => dateKey(d.date) === dateKey(date));
}

function dayCell(wrapper, date) {
  const index = indexOfDate(wrapper, date);
  if (index === -1) return null;
  return wrapper.findAll(".calendar-days .calendar-day")[index] || null;
}

function weekdayHeader(wrapper, date) {
  const index = indexOfDate(wrapper, date);
  if (index === -1) return null;
  return wrapper.findAll(".calendar-weekdays .weekday")[index] || null;
}

function chipIn(wrapper, date, title) {
  const cell = dayCell(wrapper, date);
  if (!cell) return null;
  return cell.findAll(".event-item").find(chip => chip.text().includes(title)) || null;
}

describe("CalendarView week strip — stable day/chip identity across window shifts", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.sources = [];
    cal.loading = false;
    useConfigStore().showUI = true;
  });

  it("reuses overlapping days, headers and chips when a 7-day window moves one day", async () => {
    setEvents([
      event("ev-16", "Thursday event", new Date(2026, 6, 16), 10),
      event("ev-17", "Friday event", new Date(2026, 6, 17), 10),
    ]);
    const w = mountCalendar(ROLLING_WEEK_7);
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 16);
    const cellBefore = dayCell(w, keptDate);
    const chipBefore = chipIn(w, keptDate, "Thursday event");
    const headerBefore = weekdayHeader(w, keptDate);
    expect(cellBefore).not.toBeNull();
    expect(chipBefore).not.toBeNull();
    expect(headerBefore).not.toBeNull();
    expect(dayCell(w, new Date(2026, 6, 15))).not.toBeNull();
    expect(dayCell(w, new Date(2026, 6, 22))).toBeNull();

    await chipBefore.trigger("focus");
    expect(w.vm.focusedDayIndex).toBe(1);

    useCalendarStore().setCurrentDate(new Date(2026, 6, 16));
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(cellBefore.element);
    expect(chipIn(w, keptDate, "Thursday event").element).toBe(chipBefore.element);
    expect(weekdayHeader(w, keptDate).element).toBe(headerBefore.element);
    expect(dayCell(w, new Date(2026, 6, 15))).toBeNull();
    expect(dayCell(w, new Date(2026, 6, 22))).not.toBeNull();

    // Focus stayed on Thursday (now day index 0); ArrowRight must reach Friday.
    expect(w.vm.focusedDayIndex).toBe(0);
    await w.trigger("keydown", { key: "ArrowRight" });
    await w.vm.$nextTick();
    expect(w.vm.focusedDayIndex).toBe(1);
    expect(w.vm.focusedEventIndex).toBe(0);
    expect(chipIn(w, new Date(2026, 6, 17), "Friday event").classes()).toContain("focused");
  });

  it("reuses the overlapping week when a 14-day window moves forward by a week", async () => {
    setEvents([
      event("ev-22", "Wednesday event", new Date(2026, 6, 22), 10),
      event("ev-23", "Thursday event", new Date(2026, 6, 23), 10),
    ]);
    const w = mountCalendar(ROLLING_WEEK_14);
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 22);
    const cellBefore = dayCell(w, keptDate);
    const chipBefore = chipIn(w, keptDate, "Wednesday event");
    expect(cellBefore).not.toBeNull();
    expect(chipBefore).not.toBeNull();
    expect(dayCell(w, new Date(2026, 6, 15))).not.toBeNull();
    expect(dayCell(w, new Date(2026, 7, 5))).toBeNull();

    await chipBefore.trigger("focus");
    expect(w.vm.focusedDayIndex).toBe(7);

    useCalendarStore().setCurrentDate(new Date(2026, 6, 22));
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(cellBefore.element);
    expect(chipIn(w, keptDate, "Wednesday event").element).toBe(chipBefore.element);
    expect(dayCell(w, new Date(2026, 6, 15))).toBeNull();
    expect(dayCell(w, new Date(2026, 7, 4))).not.toBeNull();

    // The focused event is now day index 0; ArrowRight reaches Thursday.
    expect(w.vm.focusedDayIndex).toBe(0);
    await w.trigger("keydown", { key: "ArrowRight" });
    await w.vm.$nextTick();
    expect(w.vm.focusedDayIndex).toBe(1);
    expect(chipIn(w, new Date(2026, 6, 23), "Thursday event").classes()).toContain("focused");
  });

  it("does not remount later chips when an earlier event is inserted into the day", async () => {
    const first = event("ev-first", "First at ten", new Date(2026, 6, 16), 10);
    const second = event("ev-second", "Second at noon", new Date(2026, 6, 16), 12);
    setEvents([first, second]);

    const w = mountCalendar(ROLLING_WEEK_7);
    await flushPromises();
    await w.vm.$nextTick();

    const day = new Date(2026, 6, 16);
    const firstBefore = chipIn(w, day, "First at ten");
    const secondBefore = chipIn(w, day, "Second at noon");
    expect(firstBefore).not.toBeNull();
    expect(secondBefore).not.toBeNull();

    setEvents([event("ev-inserted", "Inserted at nine", new Date(2026, 6, 16), 9), first, second]);
    await flushPromises();
    await w.vm.$nextTick();

    expect(chipIn(w, day, "Inserted at nine")).not.toBeNull();
    expect(chipIn(w, day, "First at ten").element).toBe(firstBefore.element);
    expect(chipIn(w, day, "Second at noon").element).toBe(secondBefore.element);
  });

  it("reuses existing days and chips when the week strip's day count grows", async () => {
    setEvents([event("ev-16", "Thursday event", new Date(2026, 6, 16), 10)]);
    const w = mountCalendar(ROLLING_WEEK_7);
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 16);
    const cellBefore = dayCell(w, keptDate);
    const chipBefore = chipIn(w, keptDate, "Thursday event");
    expect(dayCell(w, new Date(2026, 6, 22))).toBeNull();

    await w.setProps({ view: ROLLING_WEEK_14 });
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(cellBefore.element);
    expect(chipIn(w, keptDate, "Thursday event").element).toBe(chipBefore.element);
    expect(dayCell(w, new Date(2026, 6, 22))).not.toBeNull();
  });
});
