import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";
import { useModeStore } from "@/stores/mode";

function mountCalendar(view) {
  return mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
}

describe("CalendarView per-region view", () => {
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

  it("derives the view-switch label from the view prop, not global config", () => {
    const w = mountCalendar({ mode: "week", rolling: false, weeks: 4, days: 7 });
    expect(w.find(".calendar-header__view-label").text()).toBe("Week");
  });

  it("labels a rolling base view with a rolling suffix", () => {
    const w = mountCalendar({ mode: "month", rolling: true, weeks: 4, days: 7 });
    expect(w.find(".calendar-header__view-label").text()).toBe("Month · Rolling");
  });

  it("renders weeks*7 day cells for month-rolling", async () => {
    const w = mountCalendar({ mode: "month", rolling: true, weeks: 3, days: 7 });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(21);
  });

  it("non-rolling month shows the full month, ignoring the stored `weeks` count", async () => {
    // Pin July 2026 (1st is a Wed): a Monday-start grid spans 5 weeks. `weeks`
    // no longer drives non-rolling month — the whole month is always shown.
    useCalendarStore().setCurrentDate(new Date(2026, 6, 15));
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(35);
    // First cell is the week start (Monday) on/before the 1st of the month.
    expect(w.vm.calendarDays[0].date.getDay()).toBe(1);
    // The last day of the month is always present (never hidden by the count).
    expect(w.vm.calendarDays.some(d => d.date.getMonth() === 6 && d.date.getDate() === 31)).toBe(
      true
    );
  });

  it("non-rolling week shows `days` cells from the week start (not today)", async () => {
    const w = mountCalendar({ mode: "week", rolling: false, weeks: 4, days: 7 });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(7);
    expect(w.vm.calendarDays[0].date.getDay()).toBe(1); // Monday, not today
  });

  it("rolling-week renders `days` cells starting today", async () => {
    const w = mountCalendar({ mode: "week", rolling: true, weeks: 4, days: 5 });
    await w.vm.$nextTick();
    const cells = w.findAll(".calendar-day");
    expect(cells.length).toBe(5);
    expect(cells[0].classes()).toContain("today");
  });

  it("rolling-week uses date-based headers starting with today", async () => {
    const w = mountCalendar({ mode: "week", rolling: true, weeks: 4, days: 3 });
    await w.vm.$nextTick();
    const headers = w.findAll(".calendar-weekdays .weekday").map(n => n.text());
    expect(headers).toHaveLength(3);
    expect(headers[0]).toContain(String(new Date().getDate()));
  });

  it("view-switch button cycles the region's base mode via updateRegionView", async () => {
    const cfg = useConfigStore();
    cfg.updateRegionView = vi.fn().mockResolvedValue();
    const w = mountCalendar({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await w.find(".calendar-header__view-switch").trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { mode: "week" });
  });

  it("entering fullscreen carries the region's view", async () => {
    const view = { mode: "week", rolling: true, weeks: 4, days: 5 };
    const w = mountCalendar(view);
    await w.find(".calendar-header__fullscreen").trigger("click");
    expect(useModeStore().fullscreenContext.view).toEqual(view);
  });
});
