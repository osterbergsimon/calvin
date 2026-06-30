import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
import CalendarView from "@/components/CalendarView.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

describe("CalendarView rolling weeks", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.events = [];
    cal.sources = [];
    cal.loading = false;
    const cfg = useConfigStore();
    cfg.showUI = true;
    cfg.calendarViewMode = "rolling";
  });
  it("renders calendarWeeks*7 day cells in rolling view", async () => {
    useConfigStore().calendarWeeks = 3;
    const w = mount(CalendarView, { props: { sourceIds: [] } });
    await w.vm.$nextTick();
    expect(w.findAll(".calendar-day").length).toBe(21);
  });
});
