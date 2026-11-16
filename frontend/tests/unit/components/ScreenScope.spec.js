/**
 * ScreenScope tells everything inside one dashboard screen whether that screen
 * is the one on display. With the screen stack on, a hidden screen stays
 * mounted, and DashboardRegion pauses its photo rotation through this (M2):
 * a regression here is silent and only shows as CPU on a Pi.
 */
import { describe, it, expect, vi } from "vitest";
import { h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

// DashboardRegion loads its leaves through defineAsyncComponent(): a module
// mock is the reliable way to keep a prop-keeping PhotoSlideshow stub.
vi.mock("../../../src/components/PhotoSlideshow.vue", () => ({
  __esModule: true,
  default: {
    name: "PhotoSlideshow",
    props: ["autoRotate", "rotationInterval", "regionId"],
    template: '<div class="photo-slideshow-stub" :data-auto-rotate="String(autoRotate)" />',
  },
}));

import ScreenScope from "@/components/ScreenScope.vue";
import DashboardRegion from "@/components/DashboardRegion.vue";

const photoRegion = { id: "r-photos", kind: "photos", instanceIds: [], size: 100 };

const mountRegionInScope = visible =>
  mount(ScreenScope, {
    props: { visible },
    slots: {
      default: () => h(DashboardRegion, { region: photoRegion, photoRotationInterval: 30 }),
    },
    global: { stubs: { CalendarView: true, WebServiceViewer: true } },
  });

const autoRotate = wrapper => wrapper.findComponent({ name: "PhotoSlideshow" }).props("autoRotate");

describe("ScreenScope", () => {
  it("lets a visible screen rotate its photos", async () => {
    const wrapper = mountRegionInScope(true);
    await flushPromises();
    expect(autoRotate(wrapper)).toBe(true);
  });

  it("pauses photo rotation on a hidden screen", async () => {
    const wrapper = mountRegionInScope(false);
    await flushPromises();
    expect(autoRotate(wrapper)).toBe(false);
  });
});
