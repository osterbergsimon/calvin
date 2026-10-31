/**
 * Calendar header navigation at month end (CLV-70).
 *
 * The header arrows call `navigateNext`/`navigatePrevious` in CalendarView,
 * which used to do `date.setMonth(date.getMonth() + 1)`. On the 31st that rolls
 * past the short next month (Oct 31 -> Dec 1), skipping November. These tests
 * pin the clock to the four month-end dates from the brief and assert the
 * header lands on the adjacent month.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

const MONTH_VIEW = { mode: "month", rolling: false, weeks: 6, days: 7 };

function mountMonth(focused = true) {
  return mount(CalendarView, {
    props: { sourceIds: [], regionId: "r1", view: MONTH_VIEW, focused },
  });
}

// Pin "today" and the calendar's current date to the given month end.
function mountsOn(date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
  useCalendarStore().setCurrentDate(new Date());
  return mountMonth();
}

const headerLabel = wrapper => wrapper.find(".calendar-header__label").text();

describe("CalendarView header month navigation at month end (CLV-70)", () => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  const next = async w => {
    await w.find('[aria-label="Next"]').trigger("click");
  };
  const prev = async w => {
    await w.find('[aria-label="Previous"]').trigger("click");
  };

  it("Jan 31 -> next shows February", async () => {
    const w = mountsOn(new Date(2026, 0, 31));
    await next(w);
    expect(headerLabel(w)).toBe("February 2026");
  });

  it("Mar 31 -> previous shows February", async () => {
    const w = mountsOn(new Date(2026, 2, 31));
    await prev(w);
    expect(headerLabel(w)).toBe("February 2026");
  });

  it("Oct 31 -> next shows November (the reported repro)", async () => {
    const w = mountsOn(new Date(2026, 9, 31));
    await next(w);
    expect(headerLabel(w)).toBe("November 2026");
  });

  it("Dec 31 -> next rolls the year into January", async () => {
    const w = mountsOn(new Date(2026, 11, 31));
    await next(w);
    expect(headerLabel(w)).toBe("January 2027");
  });

  it("Jan 31 -> previous rolls the year back into December", async () => {
    const w = mountsOn(new Date(2027, 0, 31));
    await prev(w);
    expect(headerLabel(w)).toBe("December 2026");
  });

  it("keeps stepping correctly across consecutive month ends", async () => {
    const w = mountsOn(new Date(2026, 9, 31));
    await next(w);
    expect(headerLabel(w)).toBe("November 2026");
    await next(w);
    expect(headerLabel(w)).toBe("December 2026");
    await next(w);
    expect(headerLabel(w)).toBe("January 2027");
  });
});
