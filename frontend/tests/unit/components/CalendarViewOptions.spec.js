import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import CalendarViewOptions from "@/components/dashboard/CalendarViewOptions.vue";
import { useConfigStore } from "@/stores/config";

function mountOptions(view) {
  const cfg = useConfigStore();
  cfg.updateRegionView = vi.fn().mockResolvedValue();
  const w = mount(CalendarViewOptions, {
    attachTo: document.body,
    props: { regionId: "r1", view },
  });
  return { w, cfg };
}

const openPopover = w => w.find(".region-view-options__trigger").trigger("click");

describe("CalendarViewOptions", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("toggling rolling calls updateRegionView", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('[aria-label="Rolling window"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { rolling: true });
    w.unmount();
  });

  it("non-rolling month shows an Extra weeks count that steps extraWeeks from 0", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.find(".cvo-label").text()).toBe("Extra weeks");
    expect(w.find(".cvo-count-value").text()).toBe("0");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { extraWeeks: 1 });
    w.unmount();
  });

  it("does not step extra weeks below zero", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('[aria-label="Decrease count"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
    w.unmount();
  });

  it("rolling month keeps a Weeks count that steps the window size", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: true, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.find(".cvo-label").text()).toBe("Weeks");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weeks: 5 });
    w.unmount();
  });

  it("shows a Days count for week", async () => {
    const { w } = mountOptions({ mode: "week", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.find(".cvo-label").text()).toBe("Days");
    w.unmount();
  });

  it("does not step above the max", async () => {
    const { w, cfg } = mountOptions({ mode: "week", rolling: true, weeks: 4, days: 14 });
    await openPopover(w);
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
    w.unmount();
  });

  it("lights the trigger when rolling is active", () => {
    const { w } = mountOptions({ mode: "month", rolling: true, weeks: 4, days: 7 });
    expect(w.find(".region-view-options__trigger").classes()).toContain("icon-btn--active");
    w.unmount();
  });

  // --- Week numbers tri-state (Default / On / Off) ---

  it("week numbers show Default when the view has no override", async () => {
    const { w } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    const active = w.find('.cvo-seg [aria-checked="true"]');
    expect(active.text()).toBe("Default");
    w.unmount();
  });

  it("selecting On persists weekNumbers=true", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('.cvo-seg [aria-label="Week numbers on"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weekNumbers: true });
    w.unmount();
  });

  it("selecting Default clears the weekNumbers override", async () => {
    const { w, cfg } = mountOptions({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      weekNumbers: true,
    });
    await openPopover(w);
    expect(w.find('.cvo-seg [aria-checked="true"]').text()).toBe("On");
    await w.find('.cvo-seg [aria-label="Week numbers default"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weekNumbers: undefined });
    w.unmount();
  });

  // --- Events/day density (month only) with a Default reset ---

  it("does not show the density row outside month view", async () => {
    const { w } = mountOptions({ mode: "week", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.find(".cvo-density").exists()).toBe(false);
    w.unmount();
  });

  it("density inherits the global value and steps into an override", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    // No override yet → no reset chip, value is the global default (4).
    expect(w.find(".cvo-density .cvo-default-chip").exists()).toBe(false);
    expect(w.find(".cvo-density .cvo-count-value").text()).toBe("4");
    await w.find('[aria-label="More events per day"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { maxVisibleEvents: 5 });
    w.unmount();
  });

  it("an overridden density shows a Default chip that clears the override", async () => {
    const { w, cfg } = mountOptions({
      mode: "month",
      rolling: false,
      weeks: 4,
      days: 7,
      maxVisibleEvents: 2,
    });
    await openPopover(w);
    expect(w.find(".cvo-density .cvo-count-value").text()).toBe("2");
    await w.find(".cvo-density .cvo-default-chip").trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { maxVisibleEvents: undefined });
    w.unmount();
  });

  it("Refresh now calls calendarStore.refreshEvents", async () => {
    const { useCalendarStore } = await import("@/stores/calendar");
    const cal = useCalendarStore();
    cal.refreshEvents = vi.fn().mockResolvedValue();
    const { w } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('[data-action="refresh-now"]').trigger("click");
    expect(cal.refreshEvents).toHaveBeenCalled();
    w.unmount();
  });
});
