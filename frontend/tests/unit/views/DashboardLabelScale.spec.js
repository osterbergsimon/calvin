import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({
    handleAction: vi.fn(),
    focusRegion: vi.fn(),
    activateScreen: vi.fn(),
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";

const screens = {
  version: 2,
  activeScreenId: "s1",
  screens: [
    {
      id: "s1",
      name: "Home",
      activeRegionId: "cal",
      layout: { regions: [{ id: "cal", kind: "calendar", instanceIds: [], size: 100 }] },
    },
  ],
};

const stubs = {
  DashboardRegion: { name: "DashboardRegion", props: ["region"], template: "<div />" },
  ClockBarHorizontal: true,
  ClockBarVertical: true,
  MinimalUIOverlay: true,
  LayoutManager: { template: "<div><slot /></div>" },
};

function setup(configMutator) {
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.setDashboardScreens(screens);
  store.showUI = true;
  store.fetchConfig = vi.fn().mockResolvedValue({});
  if (configMutator) configMutator(store);
  return mount(Dashboard, { global: { stubs } });
}

describe("Dashboard label scale + unlock (calvin-6ig)", () => {
  it("applies the medium touch-size class by default (Default is unchanged)", () => {
    const w = setup();
    expect(w.find(".dashboard-view").classes()).toContain("dashboard-view--touch-medium");
  });

  it("reflects the Touch-target size setting so panel labels scale with it", () => {
    const large = setup(s => {
      s.touchControlSize = "large";
    });
    expect(large.find(".dashboard-view").classes()).toContain("dashboard-view--touch-large");

    const small = setup(s => {
      s.touchControlSize = "small";
    });
    expect(small.find(".dashboard-view").classes()).toContain("dashboard-view--touch-small");
  });

  it("marks the view unlocked only when regions are unlocked", () => {
    const locked = setup(s => {
      s.regionsLocked = true;
    });
    expect(locked.find(".dashboard-view").classes()).not.toContain("dashboard-view--unlocked");

    const unlocked = setup(s => {
      s.regionsLocked = false;
    });
    expect(unlocked.find(".dashboard-view").classes()).toContain("dashboard-view--unlocked");
  });
});
