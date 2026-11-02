import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const firstLoad = vi.hoisted(() => ({ expected: [], mounted: [], forgotten: [] }));
vi.mock("@/composables/useFirstLoadLight", () => ({
  expectFirstLoadRegion: id => firstLoad.expected.push(id),
  firstLoadRegionMounted: id => firstLoad.mounted.push(id),
  forgetFirstLoadRegion: id => firstLoad.forgotten.push(id),
}));

// Real async wrappers around tiny content components: the first-load report
// must come from the loaded component, not the empty wrapper.
vi.mock("../../../src/components/CalendarView.vue", () => ({
  __esModule: true,
  default: { name: "CalendarView", template: "<div class='content' />" },
}));
vi.mock("../../../src/components/PhotoSlideshow.vue", () => ({
  __esModule: true,
  default: { name: "PhotoSlideshow", template: "<div class='content' />" },
}));
vi.mock("../../../src/components/WebServiceViewer.vue", () => ({
  __esModule: true,
  default: { name: "WebServiceViewer", template: "<div class='content' />" },
}));

import DashboardRegion from "../../../src/components/DashboardRegion.vue";

const threeLevel = {
  id: "r1",
  kind: "calendar",
  size: 100,
  split: {
    direction: "row",
    regions: [
      { id: "r1-a", kind: "photos", size: 50 },
      {
        id: "r1-b",
        kind: "calendar",
        size: 50,
        split: {
          direction: "column",
          regions: [
            { id: "r1-b-a", kind: "photos", size: 50 },
            { id: "r1-b-b", kind: "service", size: 50 },
          ],
        },
      },
    ],
  },
};

describe("DashboardRegion recursion", () => {
  it("renders a nested DashboardRegion for a split child", async () => {
    const wrapper = mount(DashboardRegion, {
      props: { region: threeLevel, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    // DashboardRegion's leaves are defineAsyncComponent(): let the lazy imports
    // resolve before the test ends, otherwise they can land after the test
    // environment is torn down (vitest reports that as an unhandled rejection).
    await flushPromises();
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
    await flushPromises();
    const leaf = wrapper
      .findAllComponents(DashboardRegion)
      .find(c => c.props("region").id === "r1-b-a");
    await leaf.find(".dashboard-region").trigger("click");
    const events = wrapper.emitted("focus-region");
    expect(events).toBeTruthy();
    // .stop prevents ancestor @click handlers from firing, so every bubbled emit is the leaf id.
    expect(events.every(e => e[0] === "r1-b-a")).toBe(true);
  });

  it("lights the branch containing the active leaf", async () => {
    const wrapper = mount(DashboardRegion, {
      props: {
        region: threeLevel,
        photoRotationInterval: 5,
        parentDirection: "row",
        activeRegionId: "r1-b-b",
        lightActive: true,
      },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    await flushPromises();
    const byId = id =>
      wrapper.findAllComponents(DashboardRegion).find(c => c.props("region").id === id);
    expect(byId("r1-b").classes()).toContain("dashboard-subregion--lit");
    expect(byId("r1-a").classes()).not.toContain("dashboard-subregion--lit");
  });
});

describe("DashboardRegion loading light (CLV-115)", () => {
  it("gives every leaf region its own light, keyed by the leaf id", async () => {
    const { default: LoadingLight } = await import("../../../src/components/LoadingLight.vue");
    const wrapper = mount(DashboardRegion, {
      props: { region: threeLevel, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { CalendarView: true, PhotoSlideshow: true, WebServiceViewer: true } },
    });
    await flushPromises();
    const ids = wrapper.findAllComponents(LoadingLight).map(light => light.props("regionId"));
    // Split nodes draw no light of their own: only the leaves load anything.
    expect(ids.sort()).toEqual(["r1-a", "r1-b-a", "r1-b-b"]);
  });
});

// CLV-115: the first-load light settles once each region's content component
// has mounted (and started its fetch), not after a fixed timer.
describe("DashboardRegion first-load reporting", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    firstLoad.expected.length = 0;
    firstLoad.mounted.length = 0;
    firstLoad.forgotten.length = 0;
  });

  // One leaf per kind: each lazily loads its own content component.
  const oneOfEach = {
    id: "root",
    size: 100,
    split: {
      direction: "row",
      regions: [
        { id: "cal", kind: "calendar", size: 34 },
        { id: "pho", kind: "photos", size: 33 },
        { id: "svc", kind: "service", size: 33 },
      ],
    },
  };

  it("each content leaf is expected at once and reported mounted after its chunk loads", async () => {
    const wrapper = mount(DashboardRegion, {
      props: { region: oneOfEach, photoRotationInterval: 5, parentDirection: "row" },
      global: { stubs: { LoadingLight: true } },
    });
    const ids = ["cal", "pho", "svc"];
    expect(firstLoad.expected.sort()).toEqual(ids);
    // Only the empty async wrappers are up: nothing has mounted yet.
    expect(firstLoad.mounted).toEqual([]);
    await flushPromises();
    expect(wrapper.findAll(".content").length).toBe(3);
    expect(firstLoad.mounted.sort()).toEqual(ids);
    wrapper.unmount();
    expect(firstLoad.forgotten.sort()).toEqual(ids);
  });

  it("a leaf with nothing to load is not waited for", async () => {
    mount(DashboardRegion, {
      props: { region: { id: "e", kind: "empty", size: 100 }, photoRotationInterval: 5 },
      global: { stubs: { LoadingLight: true } },
    });
    await flushPromises();
    expect(firstLoad.expected).toEqual([]);
  });
});
