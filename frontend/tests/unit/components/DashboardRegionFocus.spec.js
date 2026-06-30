import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: { value: true } }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));

import DashboardRegion from "@/components/DashboardRegion.vue";

const leafStub = name => ({
  name,
  props: ["focused", "dim", "sourceIds", "isFullscreen", "autoRotate", "rotationInterval", "serviceId"],
  template: `<div class="leaf" :data-focused="focused" :data-dim="dim" />`,
});

const stubs = {
  CalendarView: leafStub("CalendarView"),
  PhotoSlideshow: leafStub("PhotoSlideshow"),
  WebServiceViewer: leafStub("WebServiceViewer"),
};

const calRegion = { id: "cal", kind: "calendar", instanceIds: [], size: 100 };

describe("DashboardRegion focus", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("emits focus-region with the region id on tap", async () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: true },
      global: { stubs },
    });
    await w.find(".dashboard-region").trigger("click");
    expect(w.emitted("focus-region")[0]).toEqual(["cal"]);
  });

  it("passes focused=true to the active leaf when lightActive", async () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: true },
      global: { stubs },
    });
    expect(w.find(".leaf").attributes("data-focused")).toBe("true");
  });

  it("does not light the leaf when lightActive is false", () => {
    const w = mount(DashboardRegion, {
      props: { region: calRegion, photoRotationInterval: 30, activeRegionId: "cal", lightActive: false },
      global: { stubs },
    });
    expect(w.find(".leaf").attributes("data-focused")).toBe("false");
  });

  it("raises only the focused sub-region so its glow isn't clipped by siblings (calvin-ltx)", () => {
    const split = {
      id: "r1",
      kind: null,
      size: 100,
      split: {
        direction: "row",
        regions: [
          { id: "s1", kind: "calendar", instanceIds: [], size: 34 },
          { id: "s2", kind: "photos", instanceIds: [], size: 33 },
          { id: "s3", kind: "photos", instanceIds: [], size: 33 },
        ],
      },
    };
    const w = mount(DashboardRegion, {
      props: { region: split, photoRotationInterval: 30, activeRegionId: "s2", lightActive: true },
      global: { stubs },
    });
    const subs = w.findAll(".dashboard-subregion");
    expect(subs).toHaveLength(3);
    expect(subs[0].classes()).not.toContain("dashboard-subregion--lit");
    expect(subs[1].classes()).toContain("dashboard-subregion--lit"); // the active one
    expect(subs[2].classes()).not.toContain("dashboard-subregion--lit");
  });

  it("raises no sub-region when the focus light is off", () => {
    const split = {
      id: "r1", kind: null, size: 100,
      split: { direction: "row", regions: [
        { id: "s1", kind: "calendar", instanceIds: [], size: 50 },
        { id: "s2", kind: "photos", instanceIds: [], size: 50 },
      ] },
    };
    const w = mount(DashboardRegion, {
      props: { region: split, photoRotationInterval: 30, activeRegionId: "s2", lightActive: false },
      global: { stubs },
    });
    expect(w.findAll(".dashboard-subregion--lit")).toHaveLength(0);
  });
});
