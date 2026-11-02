import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useActiveRegionStore } from "@/stores/activeRegion";
import { normalizeDashboardScreens } from "@/utils/layout";

const screen = () =>
  normalizeDashboardScreens({
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
  }).screens[0];

describe("activeRegion store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts from the screen's persisted activeRegionId", () => {
    const store = useActiveRegionStore();
    expect(store.getActiveRegionId(screen())).toBe("cal");
  });

  it("keeps a session-only region without touching the screen config", () => {
    const store = useActiveRegionStore();
    const home = screen();

    store.setActiveRegionId(home, "pho");

    expect(store.getActiveRegionId(home)).toBe("pho");
    expect(home.activeRegionId).toBe("cal");
  });

  it("ignores a region that is not a leaf on that screen", () => {
    const store = useActiveRegionStore();
    const home = screen();

    store.setActiveRegionId(home, "nope");

    expect(store.getActiveRegionId(home)).toBe("cal");
  });
});
