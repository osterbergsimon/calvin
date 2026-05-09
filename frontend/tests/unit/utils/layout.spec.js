/** Tests for layout utility functions. */

import { describe, it, expect } from "vitest";
import {
  MAX_TOP_REGIONS,
  addSubRegion,
  addTopRegion,
  createDashboardLayoutFromPreset,
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  getActiveDashboardRegion,
  getActiveDashboardScreen,
  getDashboardRegionOrder,
  getLayoutDirection,
  getLayoutOrder,
  getLeafRegions,
  getRegionAxisStyle,
  getSplitDirection,
  normalizeDashboardLayout,
  normalizeDashboardScreens,
  removeSubRegion,
  removeTopRegion,
  resizeAdjacentRegions,
  resizeSubRegion,
  resizeSubRegionPair,
  setLayoutDirection,
  setSplitDirection,
  setSubRegionContent,
  splitTopRegion,
  unsplitTopRegion,
} from "@/utils/layout";

describe("Layout Utilities", () => {
  describe("getLayoutOrder", () => {
    it("should return correct order for landscape with side view on left", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "left",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["verticalBarLeft", "secondary", "calendar", "verticalBarRight"]);
    });

    it("should return correct order for landscape with side view on right", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "right",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["verticalBarLeft", "calendar", "secondary", "verticalBarRight"]);
    });

    it("should return correct order for portrait with side view on top", () => {
      const order = getLayoutOrder({
        orientation: "portrait",
        sideViewPosition: "top",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: true,
      });

      expect(order).toEqual(["secondary", "horizontalBarBetween", "calendar"]);
    });

    it("should return correct order for portrait with side view on bottom", () => {
      const order = getLayoutOrder({
        orientation: "portrait",
        sideViewPosition: "bottom",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: true,
      });

      expect(order).toEqual(["calendar", "horizontalBarBetween", "secondary"]);
    });

    it("should include vertical bar between in landscape", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "left",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: true,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual([
        "verticalBarLeft",
        "secondary",
        "verticalBarBetween",
        "calendar",
        "verticalBarRight",
      ]);
    });

    it("should not include bars that are not shown", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "right",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["calendar", "secondary"]);
    });
  });

  describe("dashboard region layouts", () => {
    it("creates a legacy calendar and photos layout from old config", () => {
      const layout = normalizeDashboardLayout(null, {
        calendarSplit: 65,
        lastSideViewMode: "photos",
      });

      expect(layout).toEqual({
        version: 1,
        preset: "split_two",
        direction: null,
        regions: [
          {
            id: "region-1",
            kind: "calendar",
            serviceId: null,
            instanceIds: [],
            size: 65,
            split: null,
          },
          {
            id: "region-2",
            kind: "photos",
            serviceId: null,
            instanceIds: [],
            size: 35,
            split: null,
          },
        ],
      });
    });

    it("creates a legacy calendar and service layout from old side view mode", () => {
      const layout = normalizeDashboardLayout(null, {
        calendarSplit: 60,
        lastSideViewMode: "web_services",
      });

      expect(layout.preset).toBe("split_two");
      expect(layout.regions[0]).toMatchObject({ id: "region-1", kind: "calendar", size: 60 });
      expect(layout.regions[1]).toMatchObject({ id: "region-2", kind: "service", size: 40 });
    });

    it("keeps region content when changing to a two-region layout", () => {
      const layout = createDashboardLayoutFromPreset("split_two", {
        regions: [
          { id: "region-1", kind: "service", serviceId: "weather", size: 70 },
          { id: "region-2", kind: "service", serviceId: "meals", size: 30 },
        ],
      });

      expect(layout.regions).toEqual([
        {
          id: "region-1",
          kind: "service",
          serviceId: "weather",
          instanceIds: ["weather"],
          size: 70,
          split: null,
        },
        {
          id: "region-2",
          kind: "service",
          serviceId: "meals",
          instanceIds: ["meals"],
          size: 30,
          split: null,
        },
      ]);
    });

    it("orders secondary before primary for left or top side positions", () => {
      const regions = [
        { id: "region-1", kind: "calendar", size: 70 },
        { id: "region-2", kind: "service", size: 30 },
      ];

      expect(getDashboardRegionOrder(regions, "left").map(region => region.id)).toEqual([
        "region-2",
        "region-1",
      ]);
      expect(getDashboardRegionOrder(regions, "top").map(region => region.id)).toEqual([
        "region-2",
        "region-1",
      ]);
    });

    it("uses width for landscape and height for portrait region sizing", () => {
      const region = { id: "primary", kind: "calendar", size: 65 };

      expect(getRegionAxisStyle(region, "landscape")).toEqual({ width: "65%", height: "100%" });
      expect(getRegionAxisStyle(region, "portrait")).toEqual({ height: "65%", width: "100%" });
    });

    it("resizes adjacent regions while preserving a 100 percent total", () => {
      const regions = [
        { id: "region-1", kind: "calendar", size: 40 },
        { id: "region-2", kind: "photos", size: 30 },
        { id: "region-3", kind: "service", size: 30 },
      ];

      const resized = resizeAdjacentRegions(regions, 0, 60);

      expect(resized.map(region => region.size)).toEqual([60, 10, 30]);
      expect(resized.reduce((sum, region) => sum + region.size, 0)).toBe(100);
    });

    it("allows a single region to fill the dashboard", () => {
      const layout = createDashboardLayoutFromPreset("single");

      expect(layout.regions).toEqual([
        {
          id: "region-1",
          kind: "calendar",
          serviceId: null,
          instanceIds: [],
          size: 100,
          split: null,
        },
      ]);
      expect(getRegionAxisStyle(layout.regions[0], "landscape")).toEqual({
        width: "100%",
        height: "100%",
      });
    });
  });

  describe("dashboard screens", () => {
    it("creates a default screen config when missing", () => {
      const screens = normalizeDashboardScreens(null);

      expect(screens.activeScreenId).toBe("screen-home");
      expect(screens.screens).toHaveLength(1);
      expect(screens.screens[0]).toMatchObject({
        id: "screen-home",
        name: "Home",
        activeRegionId: "region-1",
      });
    });

    it("returns the active screen and active region", () => {
      const screens = normalizeDashboardScreens({
        activeScreenId: "services",
        screens: [
          {
            id: "home",
            name: "Home",
            layout: createDashboardLayoutFromPreset("split_two"),
            activeRegionId: "region-1",
          },
          {
            id: "services",
            name: "Services",
            layout: createDashboardLayoutFromPreset("split_two", {
              regions: [
                { id: "region-1", kind: "service", size: 50 },
                { id: "region-2", kind: "service", size: 50 },
              ],
            }),
            activeRegionId: "region-2",
          },
        ],
      });

      expect(getActiveDashboardScreen(screens).id).toBe("services");
      expect(getActiveDashboardRegion(getActiveDashboardScreen(screens)).id).toBe("region-2");
    });

    it("cycles screens and active regions", () => {
      const screens = normalizeDashboardScreens({
        activeScreenId: "home",
        screens: [
          {
            id: "home",
            name: "Home",
            layout: createDashboardLayoutFromPreset("split_two"),
            activeRegionId: "region-1",
          },
          {
            id: "services",
            name: "Services",
            layout: createDashboardLayoutFromPreset("split_two"),
            activeRegionId: "region-1",
          },
        ],
      });

      const nextScreen = cycleDashboardScreen(screens, 1);
      expect(nextScreen.activeScreenId).toBe("services");

      const nextRegion = cycleActiveDashboardRegion(nextScreen, 1);
      expect(getActiveDashboardScreen(nextRegion).activeRegionId).toBe("region-2");
    });
  });

  describe("top-level regions: add and remove", () => {
    const baseLayout = () => createDashboardLayoutFromPreset("split_two");

    it("adds a new top region and rebalances sizes to 100", () => {
      const layout = addTopRegion(baseLayout());

      expect(layout.regions).toHaveLength(3);
      const total = layout.regions.reduce((sum, r) => sum + r.size, 0);
      expect(total).toBe(100);
    });

    it("refuses to grow past MAX_TOP_REGIONS", () => {
      let layout = baseLayout();
      while (layout.regions.length < MAX_TOP_REGIONS) {
        layout = addTopRegion(layout);
      }
      expect(layout.regions).toHaveLength(MAX_TOP_REGIONS);

      const overflow = addTopRegion(layout);
      expect(overflow.regions).toHaveLength(MAX_TOP_REGIONS);
    });

    it("removes a region and renormalizes", () => {
      const layout = removeTopRegion(addTopRegion(baseLayout()), 1);

      expect(layout.regions).toHaveLength(2);
      expect(layout.regions.reduce((sum, r) => sum + r.size, 0)).toBe(100);
    });

    it("collapses to a single region without going below 1", () => {
      const layout = removeTopRegion(baseLayout(), 0);
      expect(layout.regions).toHaveLength(1);

      const tooFar = removeTopRegion(layout, 0);
      expect(tooFar.regions).toHaveLength(1);
    });
  });

  describe("splits and sub-regions", () => {
    const splitLayout = () => splitTopRegion(createDashboardLayoutFromPreset("single"), 0);

    it("splitTopRegion creates two sub-regions inheriting parent kind", () => {
      const layout = splitLayout();
      expect(layout.regions[0].split.regions).toHaveLength(2);
      expect(layout.regions[0].split.regions[0].kind).toBe("calendar");
      expect(layout.regions[0].split.regions[1].kind).not.toBe("calendar");
    });

    it("unsplitTopRegion adopts the first sub-region's content", () => {
      const layout = setSubRegionContent(splitLayout(), 0, 0, {
        kind: "service",
        serviceId: "weather",
      });
      const collapsed = unsplitTopRegion(layout, 0);
      expect(collapsed.regions[0].split).toBeNull();
      expect(collapsed.regions[0]).toMatchObject({
        kind: "service",
        serviceId: "weather",
      });
    });

    it("addSubRegion grows up to MAX_TOP_REGIONS sub-regions", () => {
      let layout = splitLayout();
      while (layout.regions[0].split.regions.length < MAX_TOP_REGIONS) {
        layout = addSubRegion(layout, 0);
      }
      expect(layout.regions[0].split.regions).toHaveLength(MAX_TOP_REGIONS);
      expect(layout.regions[0].split.regions.reduce((sum, sub) => sum + sub.size, 0)).toBe(100);

      const overflow = addSubRegion(layout, 0);
      expect(overflow.regions[0].split.regions).toHaveLength(MAX_TOP_REGIONS);
    });

    it("removeSubRegion collapses the split when only one sub would remain", () => {
      const layout = removeSubRegion(splitLayout(), 0, 1);
      expect(layout.regions[0].split).toBeNull();
      expect(layout.regions[0].kind).toBe("calendar");
    });

    it("removeSubRegion keeps the split when 2+ subs remain", () => {
      const three = addSubRegion(splitLayout(), 0);
      const layout = removeSubRegion(three, 0, 2);
      expect(layout.regions[0].split.regions).toHaveLength(2);
      expect(layout.regions[0].split.regions.reduce((sum, sub) => sum + sub.size, 0)).toBe(100);
    });

    it("resizeSubRegion handles end-of-list and middle indices", () => {
      const three = addSubRegion(splitLayout(), 0);
      const middle = resizeSubRegion(three, 0, 1, 50);
      expect(middle.regions[0].split.regions[1].size).toBe(50);

      const last = resizeSubRegion(three, 0, 2, 50);
      expect(last.regions[0].split.regions[2].size).toBe(50);
      expect(last.regions[0].split.regions.reduce((sum, sub) => sum + sub.size, 0)).toBe(100);
    });

    it("resizeSubRegionPair adjusts adjacent subs preserving total", () => {
      const three = addSubRegion(splitLayout(), 0);
      const pairTotal =
        three.regions[0].split.regions[0].size + three.regions[0].split.regions[1].size;
      const target = Math.min(pairTotal - 10, 50);
      const adjusted = resizeSubRegionPair(three, 0, 0, target);
      expect(adjusted.regions[0].split.regions[0].size).toBe(target);
      expect(adjusted.regions[0].split.regions.reduce((sum, sub) => sum + sub.size, 0)).toBe(100);
    });
  });

  describe("layout direction helpers", () => {
    it("getLayoutDirection falls back to display orientation when unset", () => {
      const layout = createDashboardLayoutFromPreset("split_two");
      expect(getLayoutDirection(layout, "landscape")).toBe("row");
      expect(getLayoutDirection(layout, "portrait")).toBe("column");
    });

    it("getLayoutDirection respects an explicit stored direction", () => {
      const layout = setLayoutDirection(createDashboardLayoutFromPreset("split_two"), "column");
      expect(getLayoutDirection(layout, "landscape")).toBe("column");
    });

    it("getSplitDirection defaults to perpendicular to the parent", () => {
      const layout = splitTopRegion(createDashboardLayoutFromPreset("single"), 0);
      expect(getSplitDirection(layout.regions[0].split, "row")).toBe("column");
      expect(getSplitDirection(layout.regions[0].split, "column")).toBe("row");
    });

    it("setSplitDirection persists an explicit sub direction", () => {
      const layout = setSplitDirection(
        splitTopRegion(createDashboardLayoutFromPreset("single"), 0),
        0,
        "row"
      );
      expect(getSplitDirection(layout.regions[0].split, "row")).toBe("row");
    });
  });

  describe("getLeafRegions and active region resolution", () => {
    it("flattens splits into leaves with parent ids", () => {
      const layout = splitTopRegion(addTopRegion(createDashboardLayoutFromPreset("single")), 0);
      const leaves = getLeafRegions(layout);
      expect(leaves.map(leaf => leaf.id)).toEqual(["region-1-a", "region-1-b", "region-2"]);
      expect(leaves[0].parentId).toBe("region-1");
      expect(leaves[2].parentId).toBeUndefined();
    });

    it("normalizeDashboardScreens accepts a sub-region id as the active leaf", () => {
      const layout = splitTopRegion(createDashboardLayoutFromPreset("single"), 0);
      const screens = normalizeDashboardScreens({
        activeScreenId: "screen-home",
        screens: [
          {
            id: "screen-home",
            name: "Home",
            layout,
            activeRegionId: "region-1-b",
          },
        ],
      });
      expect(screens.screens[0].activeRegionId).toBe("region-1-b");
    });

    it("cycling regions walks across split leaves", () => {
      const layout = splitTopRegion(addTopRegion(createDashboardLayoutFromPreset("single")), 0);
      const screens = normalizeDashboardScreens({
        activeScreenId: "screen-home",
        screens: [
          {
            id: "screen-home",
            name: "Home",
            layout,
            activeRegionId: "region-1-a",
          },
        ],
      });

      let cycled = cycleActiveDashboardRegion(screens, 1);
      expect(cycled.screens[0].activeRegionId).toBe("region-1-b");
      cycled = cycleActiveDashboardRegion(cycled, 1);
      expect(cycled.screens[0].activeRegionId).toBe("region-2");
      cycled = cycleActiveDashboardRegion(cycled, 1);
      expect(cycled.screens[0].activeRegionId).toBe("region-1-a");
    });
  });
});
