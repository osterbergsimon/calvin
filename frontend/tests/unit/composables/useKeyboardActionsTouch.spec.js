import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const pushMock = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push: pushMock }) }));

import { useConfigStore } from "@/stores/config";
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
});
