/**
 * CalendarView loading feedback (CLV-115): fetches light the region's frame
 * through the progress store; the old in-region spinner overlay is gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));
import CalendarView from "@/components/CalendarView.vue";
import { useCalendarStore } from "@/stores/calendar";
import { useConfigStore } from "@/stores/config";
import { APP_FRAME, useProgressStore } from "@/stores/progress";

const view = { mode: "month", rolling: false, weeks: 6, days: 7 };

describe("CalendarView loading light (CLV-115)", () => {
  let cal;
  let progress;
  let resolveEvents;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    cal = useCalendarStore();
    progress = useProgressStore();
    cal.setCurrentDate(new Date(2026, 6, 15));
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn(
      () =>
        new Promise(resolve => {
          resolveEvents = () => resolve({ events: [] });
        })
    );
    cal.events = [];
    cal.sources = [{ id: "s1" }];
    cal.loading = false;
    useConfigStore().showUI = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("an events fetch lights this region's frame, not the app", async () => {
    mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
    await vi.advanceTimersByTimeAsync(500);
    expect(progress.isFrameVisible("r1")).toBe(true);
    expect(progress.isFrameVisible(APP_FRAME)).toBe(false);

    resolveEvents();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(progress.isFrameVisible("r1")).toBe(false);
  });

  it("fullscreen (no region) uses the app frame", async () => {
    mount(CalendarView, { props: { sourceIds: [], isFullscreen: true, view } });
    await vi.advanceTimersByTimeAsync(500);
    expect(progress.isFrameVisible(APP_FRAME)).toBe(true);
  });

  it("a failing fetch ends its light; the region's own state speaks", async () => {
    cal.fetchEvents = vi.fn().mockRejectedValue(new Error("offline"));
    mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
    await flushPromises();
    expect(progress.active).toBe(false);
  });

  it("shows no spinner while loading, foreground or background", async () => {
    cal.loading = true;
    cal.backgroundRefreshing = true;
    const wrapper = mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.find(".loading-overlay").exists()).toBe(false);
    expect(wrapper.find(".spinner").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Loading events");
    // Cached events stay readable instead of being dimmed behind a scrim.
    expect(wrapper.find(".calendar-grid").classes()).not.toContain("loading");
  });

  it("keeps the no-calendars empty state", async () => {
    cal.sources = [];
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    const wrapper = mount(CalendarView, { props: { sourceIds: [], regionId: "r1", view } });
    await flushPromises();
    expect(wrapper.text()).toContain("No calendars yet");
  });
});
