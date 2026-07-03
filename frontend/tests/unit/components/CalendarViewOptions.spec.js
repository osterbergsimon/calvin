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
    expect(w.find(".region-view-options__trigger").classes()).toContain("active");
    w.unmount();
  });
});
