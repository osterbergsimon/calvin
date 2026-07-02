import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

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
});
