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

  it("shows the Weeks count for month even when rolling is off", async () => {
    const { w, cfg } = mountGear({ mode: "month", rolling: false, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    expect(w.find(".cvg-label").text()).toBe("Weeks");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { weeks: 5 });
  });

  it("shows a Days count for week", async () => {
    const { w } = mountGear({ mode: "week", rolling: false, weeks: 4, days: 7 });
    await w.find(".calendar-header__gear").trigger("click");
    expect(w.find(".cvg-label").text()).toBe("Days");
  });

  it("does not step above the max", async () => {
    const { w, cfg } = mountGear({ mode: "week", rolling: true, weeks: 4, days: 14 });
    await w.find(".calendar-header__gear").trigger("click");
    await w.find('[aria-label="Increase count"]').trigger("click");
    expect(cfg.updateRegionView).not.toHaveBeenCalled();
  });
});
