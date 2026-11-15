/**
 * Month grid identity across window shifts (calvin-sb9j).
 *
 * Home and Page 2 render the same CalendarView with different `view` props:
 * Home is a rolling N-week window, Page 2 a non-rolling month (plus extra
 * weeks). Their weeks overlap but the windows start on different dates. The
 * month grid must key weeks by their first day, not by position, so a screen
 * switch patches the shared weeks instead of tearing down and remounting every
 * day cell and event chip.
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
const JULY_22_2026 = new Date(2026, 6, 22);

const ROLLING_MONTH = { mode: "month", rolling: true, weeks: 4, days: 7, maxVisibleEvents: 5 };
const NON_ROLLING_MONTH = { mode: "month", rolling: false, weeks: 4, days: 7, maxVisibleEvents: 5 };

const dateKey = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

function mountCalendar(view, extraProps = {}) {
  const cal = useCalendarStore();
  cal.setCurrentDate(new Date(JULY_15_2026));
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view, ...extraProps } });
}

function setEvents(events) {
  const cal = useCalendarStore();
  cal.events = events;
  cal.eventsBySourceKey["__all__"] = events;
}

// The rendered cells are in `calendarDays` order, so find the date there and
// use its index to reach the matching DOM element.
function dayCell(wrapper, date) {
  const index = wrapper.vm.calendarDays.findIndex(d => dateKey(d.date) === dateKey(date));
  if (index === -1) return null;
  return wrapper.findAll(".calendar-day")[index] || null;
}

function chipIn(wrapper, date, title) {
  const cell = dayCell(wrapper, date);
  if (!cell) return null;
  return cell.findAll(".timed-event").find(chip => chip.text().includes(title)) || null;
}

function monthFocusKeys(wrapper) {
  return wrapper.vm.monthWeeks.flatMap(week => [
    ...week.ribbons.map(ribbon => ribbon.focusKey),
    ...week.days.flatMap(day => day.timed.map(item => item.focusKey)),
  ]);
}

function focusKeyFor(wrapper, date, title) {
  const week = wrapper.vm.monthWeeks.find(wk =>
    wk.days.some(day => dateKey(day.date) === dateKey(date))
  );
  const day = week.days.find(d => dateKey(d.date) === dateKey(date));
  const item = day.timed.find(entry => entry.ev.title === title);
  return item.focusKey;
}

const SHARED_EVENT = {
  id: "ev-shared",
  title: "Shared standup",
  start: new Date(2026, 6, 16, 10, 0).toISOString(),
  end: new Date(2026, 6, 16, 11, 0).toISOString(),
  all_day: false,
  source: "s1",
};

const SECOND_EVENT = {
  id: "ev-second",
  title: "Second event",
  start: new Date(2026, 6, 16, 12, 0).toISOString(),
  end: new Date(2026, 6, 16, 13, 0).toISOString(),
  all_day: false,
  source: "s1",
};

describe("CalendarView month grid — stable week identity across window shifts", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    setEvents([SHARED_EVENT, SECOND_EVENT]);
    cal.sources = [];
    cal.loading = false;
    useConfigStore().showUI = true;
  });

  it("keeps the shared week's day cell and chip elements when rolling -> non-rolling", async () => {
    const w = mountCalendar(ROLLING_MONTH);
    await flushPromises();
    await w.vm.$nextTick();

    const sharedDate = new Date(2026, 6, 16);
    const cellBefore = dayCell(w, sharedDate);
    const chipBefore = chipIn(w, sharedDate, "Shared standup");
    expect(cellBefore).not.toBeNull();
    expect(chipBefore).not.toBeNull();

    // Rolling (Jul 13 - Aug 9) and non-rolling July (Jun 29 - Aug 2) share the
    // weeks starting Jul 13, Jul 20 and Jul 27.
    const addedBefore = dayCell(w, new Date(2026, 5, 29));
    const droppedBefore = dayCell(w, new Date(2026, 7, 3));
    expect(addedBefore).toBeNull();
    expect(droppedBefore).not.toBeNull();

    await w.setProps({ view: NON_ROLLING_MONTH });
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, sharedDate).element).toBe(cellBefore.element);
    expect(chipIn(w, sharedDate, "Shared standup").element).toBe(chipBefore.element);

    // Weeks the new window adds/removes follow the same rule.
    expect(dayCell(w, new Date(2026, 5, 29))).not.toBeNull();
    expect(dayCell(w, new Date(2026, 7, 3))).toBeNull();
  });

  it("keeps overlapping week elements when the rolling window moves by one week", async () => {
    const w = mountCalendar(ROLLING_MONTH);
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 20);
    const cellBefore = dayCell(w, keptDate);
    const droppedBefore = dayCell(w, new Date(2026, 6, 13));
    expect(cellBefore).not.toBeNull();
    expect(droppedBefore).not.toBeNull();
    expect(dayCell(w, new Date(2026, 7, 10))).toBeNull();

    useCalendarStore().setCurrentDate(new Date(JULY_22_2026));
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(cellBefore.element);
    expect(dayCell(w, new Date(2026, 6, 13))).toBeNull();
    expect(dayCell(w, new Date(2026, 7, 10))).not.toBeNull();
  });

  it("keeps focus keys unique and stable, and keyboard focus keeps moving after a shift", async () => {
    const w = mountCalendar(ROLLING_MONTH);
    await flushPromises();
    await w.vm.$nextTick();

    const keysBefore = monthFocusKeys(w);
    expect(new Set(keysBefore).size).toBe(keysBefore.length);

    const sharedDate = new Date(2026, 6, 16);
    const firstKey = focusKeyFor(w, sharedDate, "Shared standup");
    const secondKey = focusKeyFor(w, sharedDate, "Second event");

    // Focus the first chip, then shift the window underneath it.
    const firstChip = chipIn(w, sharedDate, "Shared standup");
    await firstChip.trigger("focus");
    expect(w.vm.focusedMonthKey).toBe(firstKey);

    await w.setProps({ view: NON_ROLLING_MONTH });
    await flushPromises();
    await w.vm.$nextTick();

    const keysAfter = monthFocusKeys(w);
    expect(new Set(keysAfter).size).toBe(keysAfter.length);
    expect(focusKeyFor(w, sharedDate, "Shared standup")).toBe(firstKey);
    expect(focusKeyFor(w, sharedDate, "Second event")).toBe(secondKey);

    // Focus was on the first chip; ArrowRight must land on the second, not
    // reset to the start because the old key vanished.
    await w.trigger("keydown", { key: "ArrowRight" });
    await w.vm.$nextTick();
    expect(w.vm.focusedMonthKey).toBe(secondKey);
  });

  it("reuses overlapping weeks when a rolling month pages forward", async () => {
    const w = mountCalendar(ROLLING_MONTH, { focused: true });
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 20);
    const keptCell = dayCell(w, keptDate);
    expect(dayCell(w, new Date(2026, 6, 13))).not.toBeNull();
    expect(dayCell(w, new Date(2026, 7, 10))).toBeNull();

    await w.find('[aria-label="Next"]').trigger("click");
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(keptCell.element);
    expect(dayCell(w, new Date(2026, 6, 13))).toBeNull();
    expect(dayCell(w, new Date(2026, 7, 10))).not.toBeNull();
  });

  it("reuses overlapping weeks when a non-rolling month with extra weeks pages forward", async () => {
    const extraMonth = { ...NON_ROLLING_MONTH, extraWeeks: 2 };
    setEvents([
      {
        id: "ev-aug-5",
        title: "August fifth",
        start: new Date(2026, 7, 5, 10, 0).toISOString(),
        end: new Date(2026, 7, 5, 11, 0).toISOString(),
        all_day: false,
        source: "s1",
      },
      {
        id: "ev-aug-6",
        title: "August sixth",
        start: new Date(2026, 7, 6, 10, 0).toISOString(),
        end: new Date(2026, 7, 6, 11, 0).toISOString(),
        all_day: false,
        source: "s1",
      },
    ]);

    const w = mountCalendar(extraMonth, { focused: true });
    await flushPromises();
    await w.vm.$nextTick();

    // July's grid (Jun 29 - Aug 16) and August's (Jul 27 - Sep 20) share the
    // weeks starting Jul 27, Aug 3 and Aug 10.
    const keptDate = new Date(2026, 7, 5);
    const keptCell = dayCell(w, keptDate);
    const keptChip = chipIn(w, keptDate, "August fifth");
    expect(keptCell).not.toBeNull();
    expect(keptChip).not.toBeNull();

    const firstKey = focusKeyFor(w, keptDate, "August fifth");
    const secondKey = focusKeyFor(w, new Date(2026, 7, 6), "August sixth");
    await keptChip.trigger("focus");

    await w.find('[aria-label="Next"]').trigger("click");
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(keptCell.element);
    expect(chipIn(w, keptDate, "August fifth").element).toBe(keptChip.element);
    expect(focusKeyFor(w, keptDate, "August fifth")).toBe(firstKey);

    // Header paging clears focus; the shared chip is still focusable and
    // remote navigation continues from it in the new month.
    await chipIn(w, keptDate, "August fifth").trigger("focus");
    await w.trigger("keydown", { key: "ArrowRight" });
    await w.vm.$nextTick();
    expect(w.vm.focusedMonthKey).toBe(secondKey);
  });

  it("reuses the existing weeks when the rolling month's week count grows", async () => {
    const w = mountCalendar(ROLLING_MONTH);
    await flushPromises();
    await w.vm.$nextTick();

    const keptDate = new Date(2026, 6, 16);
    const keptCell = dayCell(w, keptDate);
    const keptChip = chipIn(w, keptDate, "Shared standup");
    expect(dayCell(w, new Date(2026, 7, 10))).toBeNull();

    await w.setProps({ view: { ...ROLLING_MONTH, weeks: 6 } });
    await flushPromises();
    await w.vm.$nextTick();

    expect(dayCell(w, keptDate).element).toBe(keptCell.element);
    expect(chipIn(w, keptDate, "Shared standup").element).toBe(keptChip.element);
    expect(dayCell(w, new Date(2026, 7, 10))).not.toBeNull();
  });
});
