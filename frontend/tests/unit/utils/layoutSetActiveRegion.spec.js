import { describe, it, expect } from "vitest";
import { setActiveDashboardRegion, normalizeDashboardScreens } from "@/utils/layout";

const baseConfig = () =>
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
  });

describe("setActiveDashboardRegion", () => {
  it("sets the active region on the active screen", () => {
    const next = setActiveDashboardRegion(baseConfig(), "pho");
    expect(next.screens[0].activeRegionId).toBe("pho");
  });

  it("ignores an unknown region id (returns config unchanged)", () => {
    const cfg = baseConfig();
    const next = setActiveDashboardRegion(cfg, "nope");
    expect(next.screens[0].activeRegionId).toBe("cal");
  });

  it("does not mutate the input", () => {
    const cfg = baseConfig();
    setActiveDashboardRegion(cfg, "pho");
    expect(cfg.screens[0].activeRegionId).toBe("cal");
  });
});
