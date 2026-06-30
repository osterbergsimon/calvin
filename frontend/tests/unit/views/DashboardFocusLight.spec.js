import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const focusRegion = vi.fn();
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn(), focusRegion, activateScreen: vi.fn() }),
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

const regionStub = {
  name: "DashboardRegion",
  props: [
    "region",
    "photoRotationInterval",
    "parentDirection",
    "activeRegionId",
    "lightActive",
    "dimOthers",
  ],
  emits: ["focus-region"],
  template:
    '<div class="region-stub" :data-light="lightActive" @click="$emit(\'focus-region\', region.id)" />',
};

const stubs = {
  DashboardRegion: regionStub,
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

describe("Dashboard focus-light", () => {
  beforeEach(() => focusRegion.mockClear());

  it("lightActive is true in interaction mode when UI is shown", () => {
    const w = setup(s => {
      s.focusLightMode = "interaction";
    });
    expect(w.find(".region-stub").attributes("data-light")).toBe("true");
  });

  it("lightActive is false in off mode even when UI is shown", () => {
    const w = setup(s => {
      s.focusLightMode = "off";
    });
    expect(w.find(".region-stub").attributes("data-light")).toBe("false");
  });

  it("a content tap focuses the region but does NOT reveal the UI by default (calvin-hgy)", async () => {
    const reveal = vi.fn();
    const w = setup(s => {
      s.focusLightMode = "interaction";
      s.showUITemporarily = reveal;
      // default: tapAnywhereReveal is false
    });
    await w.find(".region-stub").trigger("click");
    expect(focusRegion).toHaveBeenCalledWith("cal");
    expect(reveal).not.toHaveBeenCalled();
  });

  it("a content tap reveals the UI when tap-anywhere is opted in", async () => {
    const reveal = vi.fn();
    const w = setup(s => {
      s.focusLightMode = "interaction";
      s.showUITemporarily = reveal;
      s.tapAnywhereReveal = true;
    });
    await w.find(".region-stub").trigger("click");
    expect(focusRegion).toHaveBeenCalledWith("cal");
    expect(reveal).toHaveBeenCalledWith(60);
  });
});
