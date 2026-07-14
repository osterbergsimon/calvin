import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DashboardRegion from "../../../src/components/DashboardRegion.vue";

const threeLevel = {
  id: "r1", kind: "calendar", size: 100,
  split: { direction: "row", regions: [
    { id: "r1-a", kind: "photos", size: 50 },
    { id: "r1-b", kind: "calendar", size: 50,
      split: { direction: "column", regions: [
        { id: "r1-b-a", kind: "photos", size: 50 },
        { id: "r1-b-b", kind: "service", size: 50 },
      ] } },
  ] },
};

describe("DashboardRegion recursion", () => {
  it("renders a nested DashboardRegion for a split child", () => {
    const wrapper = mount(DashboardRegion, {
      props: { region: threeLevel, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    // One root + one per split node (r1, r1-b) => 2 DashboardRegion instances with a split class,
    // and leaf DashboardRegion instances for r1-a, r1-b-a, r1-b-b.
    const all = wrapper.findAllComponents(DashboardRegion);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("clicking a nested leaf emits focus-region with the leaf id, not an ancestor", async () => {
    const wrapper = mount(DashboardRegion, {
      props: { region: threeLevel, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    const leaf = wrapper
      .findAllComponents(DashboardRegion)
      .find(c => c.props("region").id === "r1-b-a");
    await leaf.find(".dashboard-region").trigger("click");
    const events = wrapper.emitted("focus-region");
    expect(events).toBeTruthy();
    // .stop prevents ancestor @click handlers from firing, so every bubbled emit is the leaf id.
    expect(events.every(e => e[0] === "r1-b-a")).toBe(true);
  });

  it("lights the branch containing the active leaf", () => {
    const wrapper = mount(DashboardRegion, {
      props: {
        region: threeLevel, photoRotationInterval: 5, parentDirection: "row",
        activeRegionId: "r1-b-b", lightActive: true,
      },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    const byId = id =>
      wrapper.findAllComponents(DashboardRegion).find(c => c.props("region").id === id);
    expect(byId("r1-b").classes()).toContain("dashboard-subregion--lit");
    expect(byId("r1-a").classes()).not.toContain("dashboard-subregion--lit");
  });
});
