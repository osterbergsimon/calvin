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
    global: { stubs: { teleport: true } },
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
    expect(w.find(".cvo-count .stepper__value").text()).toBe("0");
    await w.find('[data-step="inc"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { extraWeeks: 1 });
    w.unmount();
  });

  it("does not step extra weeks below zero", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    await w.find('[data-step="dec"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
    w.unmount();
  });

  it("rolling month keeps a Weeks count that steps the window size", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: true, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.find(".cvo-label").text()).toBe("Weeks");
    await w.find('[data-step="inc"]').trigger("click");
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
    await w.find('[data-step="inc"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
    w.unmount();
  });

  it("lights the trigger when rolling is active", () => {
    const { w } = mountOptions({ mode: "month", rolling: true, weeks: 4, days: 7 });
    expect(w.find(".region-view-options__trigger").classes()).toContain("icon-btn--active");
    w.unmount();
  });

  // --- Week numbers (region toggle) ---

  it("week numbers are off when the region has none", async () => {
    const { w } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    const toggle = w
      .findAllComponents({ name: "ToggleSwitch" })
      .find(c => c.props("ariaLabel") === "Week numbers");
    expect(toggle.props("modelValue")).toBe(false);
    w.unmount();
  });

  it("turning week numbers on persists weekNumbers=true for that region", async () => {
    const { w, cfg } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    w.findAllComponents({ name: "ToggleSwitch" })
      .find(c => c.props("ariaLabel") === "Week numbers")
      .vm.$emit("update:modelValue", true);
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weekNumbers: true });
    w.unmount();
  });

  it("no longer offers events per day on the dashboard", async () => {
    const { w } = mountOptions({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await openPopover(w);
    expect(w.text()).not.toContain("Events/day");
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
