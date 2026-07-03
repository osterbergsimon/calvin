import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

function mountCalendar(view) {
  useCalendarStore().setCurrentDate(new Date(2026, 6, 15));
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
}

describe("CalendarView per-region display overrides (inherit from global)", () => {
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

  it("week numbers inherit the global setting when the view has no override", () => {
    useConfigStore().showWeekNumbers = true;
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    expect(w.vm.showWeekNumbers).toBe(true);
    expect(w.findAll(".week-number").length).toBeGreaterThan(0);
  });

  it("a weekNumbers=true override wins over a global-off setting", () => {
    useConfigStore().showWeekNumbers = false;
    const w = mountCalendar({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      weekNumbers: true,
    });
    expect(w.vm.showWeekNumbers).toBe(true);
    expect(w.findAll(".week-number").length).toBeGreaterThan(0);
  });

  it("a weekNumbers=false override wins over a global-on setting", () => {
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

  it("event density inherits the global maxVisibleEvents when unset", () => {
    useConfigStore().maxVisibleEvents = 6;
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    expect(w.vm.maxVisibleEvents).toBe(6);
  });

  it("a maxVisibleEvents override wins over the global value", () => {
    useConfigStore().maxVisibleEvents = 6;
    const w = mountCalendar({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      maxVisibleEvents: 2,
    });
    expect(w.vm.maxVisibleEvents).toBe(2);
  });
});
