import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import CalendarViewGear from "@/components/dashboard/CalendarViewGear.vue";
import { useConfigStore } from "@/stores/config";

function mountGear(view) {
  const cfg = useConfigStore();
  cfg.updateRegionView = vi.fn().mockResolvedValue();
  const w = mount(CalendarViewGear, { props: { regionId: "r1", view } });
  return { w, cfg };
}

describe("CalendarViewGear", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("toggling rolling calls updateRegionView", async () => {
    const { w, cfg } = mountGear({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    await w.find('[aria-label="Rolling window"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { rolling: true });
  });

  it("shows a Weeks stepper for month-rolling and steps within bounds", async () => {
    const { w, cfg } = mountGear({ mode: "month", rolling: true, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    expect(w.find(".cvg-count-label").text()).toBe("Weeks");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weeks: 5 });
  });

  it("shows a Days stepper for week-rolling", async () => {
    const { w } = mountGear({ mode: "week", rolling: true, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    expect(w.find(".cvg-count-label").text()).toBe("Days");
  });

  it("does not clamp above max", async () => {
    const { w, cfg } = mountGear({ mode: "week", rolling: true, weeks: 4, days: 14 });
    await w.find(".calendar-header__gear").trigger("click");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
  });

  it("hides rolling controls when base view is day", async () => {
    const { w } = mountGear({ mode: "day", rolling: false, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    expect(w.find('[aria-label="Rolling window"]').exists()).toBe(false);
  });
});
