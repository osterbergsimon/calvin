/**
 * CalendarView fetches events for one computed window (calvin-qqnk).
 *
 * The view used to watch date, sources, mode, weeks, days, extra weeks and
 * rolling separately, so a screen switch that changed several at once fired
 * several fetches. These tests pin the single-window watcher.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

const monthView = { mode: "month", rolling: false, weeks: 4, days: 7, extraWeeks: 0 };

function mountCalendar() {
  return mount(CalendarView, {
    props: { sourceIds: [], regionId: "r1", view: monthView },
  });
}

describe("CalendarView event window (calvin-qqnk)", () => {
  let cal;

  beforeEach(() => {
    setActivePinia(createPinia());
    cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.events = [];
    cal.sources = [];
    cal.loading = false;
    cal.setCurrentDate(new Date(2026, 6, 15));
    useConfigStore().showUI = true;
  });

  it("changing several view props at once makes one fetch", async () => {
    const wrapper = mountCalendar();
    await flushPromises();
    cal.fetchEvents.mockClear();

    // Mirrors a screen switch: mode, rolling, week count, day count and
    // look-ahead all change in the same update.
    await wrapper.setProps({
      view: { mode: "week", rolling: true, weeks: 3, days: 5, extraWeeks: 2 },
    });
    await flushPromises();

    expect(cal.fetchEvents).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("a second update for the same window makes no additional fetch", async () => {
    const wrapper = mountCalendar();
    await flushPromises();
    cal.fetchEvents.mockClear();

    await wrapper.setProps({ view: { ...monthView } });
    await flushPromises();

    expect(cal.fetchEvents).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
