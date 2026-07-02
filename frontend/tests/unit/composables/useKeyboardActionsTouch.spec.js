import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const pushMock = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push: pushMock }) }));

import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { useKeyboardActions } from "@/composables/useKeyboardActions";

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
    {
      id: "s2",
      name: "Second",
      activeRegionId: "svc",
      layout: { regions: [{ id: "svc", kind: "service", instanceIds: [], size: 100 }] },
    },
  ],
};

describe("useKeyboardActions touch helpers", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockClear();
  });

  it("focusRegion sets the active region and persists", () => {
    const store = useConfigStore();
    store.setDashboardScreens(screens);
    const updateSpy = vi.spyOn(store, "updateConfig").mockResolvedValue({});
    const { focusRegion } = useKeyboardActions();

    focusRegion("pho");

    expect(store.dashboardScreens.screens[0].activeRegionId).toBe("pho");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dashboardScreens: expect.any(Object) })
    );
  });

  it("activateScreen switches active screen and routes home", () => {
    const store = useConfigStore();
    store.setDashboardScreens(screens);
    vi.spyOn(store, "updateConfig").mockResolvedValue({});
    const { activateScreen } = useKeyboardActions();

    activateScreen("s2");

    expect(store.dashboardScreens.activeScreenId).toBe("s2");
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("web_service_enter_fullscreen carries the active region's service into fullscreen", () => {
    const store = useConfigStore();
    store.setDashboardScreens({
      version: 2,
      activeScreenId: "s2",
      screens: [
        {
          id: "s1",
          name: "Home",
          activeRegionId: "mealie",
          layout: {
            regions: [{ id: "mealie", kind: "service", instanceIds: ["mealie-1"], size: 100 }],
          },
        },
        {
          id: "s2",
          name: "Weather",
          activeRegionId: "yr",
          layout: {
            regions: [{ id: "yr", kind: "service", instanceIds: ["yr-weather-1"], size: 100 }],
          },
        },
      ],
    });
    const modeStore = useModeStore();
    const { handleAction } = useKeyboardActions();

    handleAction("web_service_enter_fullscreen");

    expect(modeStore.isFullscreen).toBe(true);
    expect(modeStore.fullscreenMode).toBe(modeStore.MODES.WEB_SERVICES);
    // The region the user pressed expand on is the yr service, not the globally
    // "current" service — fullscreen must show that region's service.
    expect(modeStore.fullscreenContext?.serviceId).toBe("yr-weather-1");
  });
});
