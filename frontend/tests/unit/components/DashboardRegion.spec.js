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
});
