import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

function mountCalendar(view) {
  useCalendarStore().setCurrentDate(new Date(2026, 6, 15));
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
}

describe("CalendarView per-region display settings (CLV-49)", () => {
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

  it("does not read the old household week-number key", () => {
    useConfigStore().showWeekNumbers = true;
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    expect(w.vm.showWeekNumbers).toBe(false);
    expect(w.findAll(".week-spine").length).toBe(0);
  });

  it("a weekNumbers=true region value shows week numbers", () => {
    const w = mountCalendar({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      weekNumbers: true,
    });
    expect(w.vm.showWeekNumbers).toBe(true);
    expect(w.findAll(".week-spine").length).toBeGreaterThan(0);
  });

  it("a weekNumbers=false region value hides them", () => {
    useConfigStore().showWeekNumbers = true;
    const w = mountCalendar({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      weekNumbers: false,
    });
    expect(w.vm.showWeekNumbers).toBe(false);
    expect(w.findAll(".week-number").length).toBe(0);
  });

  it("events per day defaults to Auto instead of the old global key", () => {
    useConfigStore().maxVisibleEvents = 6;
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    expect(w.vm.eventDensity).toBe("auto");
  });

  it("a fixed events-per-day value is honoured", () => {
    const w = mountCalendar({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      maxVisibleEvents: 2,
    });
    expect(w.vm.eventDensity).toBe(2);
    expect(w.vm.maxVisibleEvents).toBe(2);
  });
});

describe("CalendarView Auto events per day", () => {
  let observers;

  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.sources = [];
    cal.loading = false;
    useConfigStore().showUI = true;

    const at = (hour, minute = 0) => new Date(2026, 6, 15, hour, minute).toISOString();
    cal.events = [
      { id: "e1", title: "One", start: at(9), end: at(10), all_day: false },
      { id: "e2", title: "Two", start: at(10), end: at(11), all_day: false },
      { id: "e3", title: "Three", start: at(11), end: at(12), all_day: false },
      { id: "e4", title: "Four", start: at(12), end: at(13), all_day: false },
      { id: "e5", title: "Five", start: at(13), end: at(14), all_day: false },
    ];
    cal.eventsBySourceKey["__all__"] = cal.events;

    observers = [];
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    };
  });

  afterEach(() => {
    delete globalThis.ResizeObserver;
  });

  it("fits the rows to the measured day cell and shows +N more", async () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await flushPromises();
    await w.vm.$nextTick();

    expect(observers.length).toBeGreaterThan(0);
    // A 60px event area with the default 20px chip row fits three rows.
    // (Other components in the tree also observe size, so feed them all.)
    observers.forEach(observer => observer.callback([{ contentRect: { height: 60, width: 200 } }]));
    await w.vm.$nextTick();
    await flushPromises();

    expect(w.vm.eventDensity).toBe("auto");
    expect(w.vm.measuredCellHeight).toBe(60);
    expect(w.vm.maxVisibleEvents).toBe(3);
    const day = w.vm.monthWeeks.flatMap(week => week.days).find(d => d.date.getDate() === 15);
    expect(day.timed.length).toBe(3);
    expect(day.hiddenCount).toBe(2);
    expect(w.text()).toContain("+2 more");
  });

  it("shows at least one row even in a tiny cell", async () => {
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await flushPromises();
    await w.vm.$nextTick();

    observers.forEach(observer => observer.callback([{ contentRect: { height: 6, width: 200 } }]));
    await w.vm.$nextTick();
    await flushPromises();

    expect(w.vm.maxVisibleEvents).toBe(1);
  });
});
