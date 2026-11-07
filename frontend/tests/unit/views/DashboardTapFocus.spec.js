/**
 * A tap focuses a region for the focus light and touch navigation. It is a
 * session action, not a settings change: it must not POST the whole
 * dashboardScreens config (calvin-ex6w, kiosk performance fix 5).
 */

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";
import { useActiveRegionStore } from "@/stores/activeRegion";

const screens = {
  version: 2,
  activeScreenId: "s1",
  screens: [
    {
      id: "s1",
      name: "Home",
      activeRegionId: "cal",
      layout: {
        regions: [
          { id: "cal", kind: "calendar", instanceIds: [], size: 50 },
          { id: "pho", kind: "photos", instanceIds: [], size: 50 },
        ],
      },
    },
  ],
};

const regionStub = {
  name: "DashboardRegion",
  props: ["region", "activeRegionId", "lightActive"],
  emits: ["focus-region"],
  template:
    '<div class="region-stub" :data-active="activeRegionId" @click="$emit(\'focus-region\', \'pho\')" />',
};

const stubs = {
  DashboardRegion: regionStub,
  ClockBarHorizontal: true,
  ClockBarVertical: true,
  MinimalUIOverlay: true,
  LayoutManager: { template: "<div><slot /></div>" },
};

function setup() {
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.setDashboardScreens(screens);
  store.showUI = true;
  store.fetchConfig = vi.fn().mockResolvedValue({});
  const wrapper = mount(Dashboard, { global: { stubs } });
  return { wrapper, store };
}

describe("Dashboard region tap focus", () => {
  it("updates the lit region without writing config", async () => {
    const { wrapper, store } = setup();
    const updateSpy = vi.spyOn(store, "updateConfig").mockResolvedValue({});

    await wrapper.find(".region-stub").trigger("click");

    const activeRegion = useActiveRegionStore();
    expect(activeRegion.getActiveRegionId(screens.screens[0])).toBe("pho");
    expect(updateSpy).not.toHaveBeenCalled();
    expect(store.dashboardScreens.screens[0].activeRegionId).toBe("cal");
    wrapper.unmount();
  });
});
