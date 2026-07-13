import { describe, it, expect } from "vitest";
import {
  setActiveDashboardRegion,
  getActiveDashboardScreen,
  cycleActiveDashboardRegion,
  setRegionView,
  normalizeDashboardScreens,
} from "@/utils/layout";

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

const twoScreens = () =>
  normalizeDashboardScreens({
    version: 2,
    activeScreenId: "a",
    screens: [
      {
        id: "a",
        name: "A",
        activeRegionId: "a1",
        layout: {
          regions: [
            { id: "a1", kind: "calendar", instanceIds: [], size: 50 },
            { id: "a2", kind: "photos", instanceIds: [], size: 50 },
          ],
        },
      },
      {
        id: "b",
        name: "B",
        activeRegionId: "b1",
        layout: {
          regions: [
            { id: "b1", kind: "calendar", instanceIds: [], size: 50 },
            { id: "b2", kind: "photos", instanceIds: [], size: 50 },
          ],
        },
      },
    ],
  });

describe("layout locators honor an explicit activeScreenId (dd9.8)", () => {
  it("getActiveDashboardScreen returns the passed screen, else activeScreenId", () => {
    const cfg = twoScreens();
    expect(getActiveDashboardScreen(cfg).id).toBe("a"); // default = activeScreenId
    expect(getActiveDashboardScreen(cfg, "b").id).toBe("b"); // explicit override
  });

  it("setActiveDashboardRegion targets the passed screen, not activeScreenId", () => {
    const next = setActiveDashboardRegion(twoScreens(), "b2", "b");
    expect(next.screens.find(s => s.id === "b").activeRegionId).toBe("b2");
    expect(next.screens.find(s => s.id === "a").activeRegionId).toBe("a1"); // untouched
    expect(next.activeScreenId).toBe("a"); // global active unchanged
  });

  it("cycleActiveDashboardRegion cycles the passed screen's region", () => {
    const next = cycleActiveDashboardRegion(twoScreens(), 1, "b");
    expect(next.screens.find(s => s.id === "b").activeRegionId).toBe("b2");
    expect(next.screens.find(s => s.id === "a").activeRegionId).toBe("a1"); // untouched
    expect(next.activeScreenId).toBe("a");
  });

  it("setRegionView patches a region view on the passed screen", () => {
    const next = setRegionView(twoScreens(), "b1", { weeks: 3 }, "b");
    const bCal = next.screens.find(s => s.id === "b").layout.regions.find(r => r.id === "b1");
    expect(bCal.view.weeks).toBe(3);
    const aCal = next.screens.find(s => s.id === "a").layout.regions.find(r => r.id === "a1");
    expect(aCal.view.weeks).toBe(4); // A untouched — default weeks, not the patch
  });

  it("omitting activeScreenId keeps the current activeScreenId behavior", () => {
    const next = cycleActiveDashboardRegion(twoScreens(), 1); // no id -> screen "a"
    expect(next.screens.find(s => s.id === "a").activeRegionId).toBe("a2");
    expect(next.screens.find(s => s.id === "b").activeRegionId).toBe("b1");
  });
});
