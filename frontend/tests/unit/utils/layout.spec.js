/** Tests for layout utility functions. */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CALENDAR_VIEW,
  MAX_TOP_REGIONS,
  addSubRegion,
  addTopRegion,
  clampCalendarView,
  clampServiceView,
  computeClockBarModeUpdate,
  computeClockBarPositionUpdate,
  createDashboardLayoutFromPreset,
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  getActiveDashboardRegion,
  getActiveDashboardScreen,
  getClockBarBetweenIndex,
  getClockBarPlacementGap,
  getDashboardRegionOrder,
  getGlobalClockBarSettings,
  getLayoutDirection,
  getLayoutOrder,
  getLeafRegions,
  getRegionAxisStyle,
  getSplitDirection,
  isClockBarBetweenPosition,
  normalizeClockBarPosition,
  normalizeDashboardLayout,
  normalizeDashboardScreens,
  normalizeScreenClockBar,
  removeSubRegion,
  removeTopRegion,
  resizeAdjacentRegions,
  resizeSubRegion,
  resizeSubRegionPair,
  resolveClockBarForScreen,
  setLayoutDirection,
  setRegionView,
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
            view: DEFAULT_CALENDAR_VIEW,
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
          view: {},
        },
        {
          id: "region-2",
          kind: "service",
          serviceId: "meals",
          instanceIds: ["meals"],
          size: 30,
          split: null,
          view: {},
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
          view: DEFAULT_CALENDAR_VIEW,
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

  describe("clock bar per-screen settings", () => {
    const screenWith = (regionsCount, clockBar) => ({
      id: "screen-1",
      name: "Test",
      layout: {
        version: 1,
        preset: "split_two",
        direction: null,
        regions: Array.from({ length: regionsCount }, (_, i) => ({
          id: `region-${i + 1}`,
          kind: "calendar",
          instanceIds: [],
          size: Math.floor(100 / regionsCount),
          split: null,
        })),
      },
      activeRegionId: "region-1",
      clockBar: clockBar ?? null,
    });

    describe("normalizeClockBarPosition", () => {
      it("returns perimeter values unchanged", () => {
        expect(normalizeClockBarPosition("top", 2)).toBe("top");
        expect(normalizeClockBarPosition("bottom", 2)).toBe("bottom");
        expect(normalizeClockBarPosition("left", 2)).toBe("left");
        expect(normalizeClockBarPosition("right", 2)).toBe("right");
      });

      it("normalizes 'between' to canonical first-gap form", () => {
        expect(normalizeClockBarPosition("between", 3)).toBe("between");
        expect(normalizeClockBarPosition("between:0", 3)).toBe("between");
      });

      it("preserves valid between:N for higher gaps", () => {
        expect(normalizeClockBarPosition("between:1", 3)).toBe("between:1");
        expect(normalizeClockBarPosition("between:2", 4)).toBe("between:2");
      });

      it("clamps between:N to the last available gap", () => {
        expect(normalizeClockBarPosition("between:5", 3)).toBe("between:1");
        expect(normalizeClockBarPosition("between:1", 2)).toBe("between");
      });

      it("rejects unknown values", () => {
        expect(normalizeClockBarPosition("nope", 2)).toBeNull();
        expect(normalizeClockBarPosition(null, 2)).toBeNull();
        expect(normalizeClockBarPosition(undefined, 2)).toBeNull();
      });
    });

    describe("getClockBarBetweenIndex / isClockBarBetweenPosition", () => {
      it("returns 0 for 'between' and the parsed index for 'between:N'", () => {
        expect(getClockBarBetweenIndex("between")).toBe(0);
        expect(getClockBarBetweenIndex("between:2")).toBe(2);
      });

      it("returns null for non-between positions", () => {
        expect(getClockBarBetweenIndex("top")).toBeNull();
        expect(getClockBarBetweenIndex("right")).toBeNull();
        expect(getClockBarBetweenIndex(null)).toBeNull();
      });

      it("isClockBarBetweenPosition mirrors the index check", () => {
        expect(isClockBarBetweenPosition("between")).toBe(true);
        expect(isClockBarBetweenPosition("between:3")).toBe(true);
        expect(isClockBarBetweenPosition("top")).toBe(false);
      });
    });

    describe("normalizeScreenClockBar", () => {
      it("returns null for empty/invalid input", () => {
        expect(normalizeScreenClockBar(null, 2)).toBeNull();
        expect(normalizeScreenClockBar({}, 2)).toBeNull();
        expect(normalizeScreenClockBar({ enabled: "yes" }, 2)).toBeNull();
      });

      it("keeps recognized fields and drops unknown ones", () => {
        expect(
          normalizeScreenClockBar(
            { enabled: false, mode: "vertical", position: "left", junk: 42 },
            2
          )
        ).toEqual({ enabled: false, mode: "vertical", position: "left" });
      });

      it("clamps stale between indices", () => {
        expect(normalizeScreenClockBar({ position: "between:5" }, 3)).toEqual({
          position: "between:1",
        });
      });
    });

    describe("normalizeDashboardScreen with clockBar", () => {
      it("populates clockBar=null when no override provided", () => {
        const screens = normalizeDashboardScreens({
          version: 2,
          activeScreenId: "screen-1",
          screens: [{ id: "screen-1", name: "Home" }],
        });
        expect(screens.screens[0].clockBar).toBeNull();
      });

      it("preserves a valid override", () => {
        const screens = normalizeDashboardScreens({
          version: 2,
          activeScreenId: "screen-1",
          screens: [
            {
              id: "screen-1",
              name: "Home",
              clockBar: { enabled: false, mode: "vertical", position: "right" },
            },
          ],
        });
        expect(screens.screens[0].clockBar).toEqual({
          enabled: false,
          mode: "vertical",
          position: "right",
        });
      });
    });

    describe("resolveClockBarForScreen", () => {
      const globals = { enabled: true, mode: "horizontal", position: "top" };

      it("falls back to globals when no override exists", () => {
        const screen = screenWith(2, null);
        expect(resolveClockBarForScreen(screen, globals)).toEqual({
          enabled: true,
          mode: "horizontal",
          position: "top",
        });
      });

      it("merges per-screen overrides on top of globals", () => {
        const screen = screenWith(2, { mode: "vertical", position: "left" });
        expect(resolveClockBarForScreen(screen, globals)).toEqual({
          enabled: true,
          mode: "vertical",
          position: "left",
        });
      });

      it("coerces an inconsistent (mode, position) pair to a sane perimeter", () => {
        const screen = screenWith(2, { mode: "horizontal", position: "left" });
        expect(resolveClockBarForScreen(screen, globals).position).toBe("top");
      });

      it("falls back to a perimeter when 'between' is requested with <2 regions", () => {
        const screen = screenWith(1, { position: "between" });
        const resolved = resolveClockBarForScreen(screen, globals);
        expect(resolved.position).toBe("top");
      });

      it("clamps a stale between index against the screen's region count", () => {
        const screen = screenWith(3, { position: "between:9" });
        expect(resolveClockBarForScreen(screen, globals).position).toBe("between:1");
      });

      it("honors per-screen enabled=false override", () => {
        const screen = screenWith(2, { enabled: false });
        expect(resolveClockBarForScreen(screen, globals).enabled).toBe(false);
      });
    });

    describe("getGlobalClockBarSettings", () => {
      it("defaults to enabled horizontal/top when config is empty", () => {
        expect(getGlobalClockBarSettings({})).toEqual({
          enabled: true,
          mode: "horizontal",
          position: "top",
        });
      });

      it("reads mode and position from config", () => {
        expect(
          getGlobalClockBarSettings({ clockBarMode: "vertical", clockBarPosition: "right" })
        ).toEqual({ enabled: true, mode: "vertical", position: "right" });
      });

      it("coerces unknown mode to horizontal", () => {
        expect(getGlobalClockBarSettings({ clockBarMode: "diagonal" }).mode).toBe("horizontal");
      });
    });

    describe("getClockBarPlacementGap", () => {
      it("returns null for non-between positions", () => {
        expect(getClockBarPlacementGap("top", 3)).toBeNull();
        expect(getClockBarPlacementGap("right", 3)).toBeNull();
        expect(getClockBarPlacementGap(null, 3)).toBeNull();
      });

      it("returns null when there are fewer than 2 regions", () => {
        expect(getClockBarPlacementGap("between", 0)).toBeNull();
        expect(getClockBarPlacementGap("between", 1)).toBeNull();
        expect(getClockBarPlacementGap("between:2", 1)).toBeNull();
      });

      it("returns the parsed gap index for valid between:N", () => {
        expect(getClockBarPlacementGap("between", 3)).toBe(0);
        expect(getClockBarPlacementGap("between:1", 3)).toBe(1);
        expect(getClockBarPlacementGap("between:2", 4)).toBe(2);
      });

      it("clamps stale between:N to the last available gap (regression for #34)", () => {
        // 3 regions => gaps 0..1; between:9 should fall to gap 1.
        expect(getClockBarPlacementGap("between:9", 3)).toBe(1);
        // 2 regions => only gap 0.
        expect(getClockBarPlacementGap("between:5", 2)).toBe(0);
      });

      it("clamps negative-ish indices to 0", () => {
        expect(getClockBarPlacementGap("between:0", 5)).toBe(0);
      });
    });

    describe("computeClockBarPositionUpdate", () => {
      const globals = { enabled: true, mode: "horizontal", position: "top" };

      it("returns null for an invalid position", () => {
        const screen = screenWith(2, null);
        expect(computeClockBarPositionUpdate(screen, "nope", globals)).toBeNull();
      });

      it("clears the override when the new position matches global on every dimension", () => {
        const screen = screenWith(2, null);
        expect(computeClockBarPositionUpdate(screen, "top", globals)).toEqual({ clear: true });
      });

      it("does NOT clear when the inferred mode differs from global mode", () => {
        // Global is vertical/right; user drops onto 'top'. Position 'top' implies
        // horizontal mode, so we must keep an override that pins mode=horizontal —
        // otherwise resolution would coerce back to a vertical perimeter.
        const verticalGlobals = { enabled: true, mode: "vertical", position: "top" };
        const screen = screenWith(2, null);
        const result = computeClockBarPositionUpdate(screen, "top", verticalGlobals);
        expect(result).toEqual({ patch: { position: "top", mode: "horizontal" } });
      });

      it("does NOT clear when the screen has an enabled override", () => {
        const screen = screenWith(2, { enabled: false });
        const result = computeClockBarPositionUpdate(screen, "top", globals);
        expect(result).toEqual({ patch: { position: "top", mode: "horizontal" } });
      });

      it("does NOT clear when the screen has a mode override", () => {
        const screen = screenWith(2, { mode: "vertical" });
        const result = computeClockBarPositionUpdate(screen, "top", globals);
        expect(result).toEqual({ patch: { position: "top", mode: "horizontal" } });
      });

      it("pins mode for perimeter positions so screen owns its orientation", () => {
        const screen = screenWith(2, null);
        expect(computeClockBarPositionUpdate(screen, "left", globals)).toEqual({
          patch: { position: "left", mode: "vertical" },
        });
        expect(computeClockBarPositionUpdate(screen, "bottom", globals)).toEqual({
          patch: { position: "bottom", mode: "horizontal" },
        });
      });

      it("does not pin mode for between positions (mode-agnostic)", () => {
        const screen = screenWith(3, null);
        expect(computeClockBarPositionUpdate(screen, "between:1", globals)).toEqual({
          patch: { position: "between:1" },
        });
      });

      it("clamps stale between:N before patching", () => {
        const screen = screenWith(3, null);
        expect(computeClockBarPositionUpdate(screen, "between:9", globals)).toEqual({
          patch: { position: "between:1" },
        });
      });
    });

    describe("computeClockBarModeUpdate", () => {
      const globals = { enabled: true, mode: "horizontal", position: "top" };

      it("returns null for an invalid mode", () => {
        const screen = screenWith(2, null);
        expect(computeClockBarModeUpdate(screen, "diagonal", globals)).toBeNull();
      });

      it("flips position to a default perimeter when the new mode invalidates it", () => {
        // Resolved is vertical/left, switching to horizontal -> default 'top'.
        const screen = screenWith(2, { mode: "vertical", position: "left" });
        expect(computeClockBarModeUpdate(screen, "horizontal", globals)).toEqual({
          patch: { mode: "horizontal", position: "top" },
        });
      });

      it("keeps a between position untouched (mode-agnostic)", () => {
        const screen = screenWith(3, { position: "between:1" });
        expect(computeClockBarModeUpdate(screen, "vertical", globals)).toEqual({
          patch: { mode: "vertical" },
        });
      });

      it("only patches mode when the resolved perimeter already matches", () => {
        const screen = screenWith(2, { position: "bottom" });
        expect(computeClockBarModeUpdate(screen, "horizontal", globals)).toEqual({
          patch: { mode: "horizontal" },
        });
      });
    });
  });
});

describe("calendar region view", () => {
  const screenWith = region => ({
    activeScreenId: "s1",
    screens: [{ id: "s1", layout: { regions: [region] } }],
  });

  it("backfills the default view on a calendar region with none", () => {
    const screens = normalizeDashboardScreens(
      screenWith({ id: "region-1", kind: "calendar", instanceIds: [], size: 100 })
    );
    expect(screens.screens[0].layout.regions[0].view).toEqual(DEFAULT_CALENDAR_VIEW);
  });

  it("preserves and clamps an explicit view", () => {
    const screens = normalizeDashboardScreens(
      screenWith({
        id: "region-1",
        kind: "calendar",
        instanceIds: [],
        size: 100,
        view: { mode: "week", rolling: true, weeks: 99, days: 99, extraWeeks: 99 },
      })
    );
    expect(screens.screens[0].layout.regions[0].view).toEqual({
      mode: "week",
      rolling: true,
      weeks: 12,
      days: 14,
      extraWeeks: 8,
    });
  });

  it("does not add a view block to non-calendar regions", () => {
    const screens = normalizeDashboardScreens(
      screenWith({ id: "region-1", kind: "photos", instanceIds: [], size: 100 })
    );
    expect(screens.screens[0].layout.regions[0].view).toBeUndefined();
  });

  it("clampCalendarView coerces bad values to the valid range", () => {
    expect(
      clampCalendarView({ mode: "bogus", rolling: 1, weeks: 0, days: 50, extraWeeks: -3 })
    ).toEqual({
      mode: "month",
      rolling: true,
      weeks: 1,
      days: 14,
      extraWeeks: 0,
    });
  });

  it("omits the optional display-override fields when absent (inherit from global)", () => {
    const v = clampCalendarView({ mode: "month", rolling: false, weeks: 4, days: 7 });
    expect("weekNumbers" in v).toBe(false);
    expect("maxVisibleEvents" in v).toBe(false);
  });

  it("preserves a weekNumbers override (true/false) and clamps maxVisibleEvents 1-20", () => {
    expect(clampCalendarView({ weekNumbers: true, maxVisibleEvents: 6 })).toMatchObject({
      weekNumbers: true,
      maxVisibleEvents: 6,
    });
    expect(clampCalendarView({ weekNumbers: false })).toMatchObject({ weekNumbers: false });
    expect(clampCalendarView({ maxVisibleEvents: 99 }).maxVisibleEvents).toBe(20);
    expect(clampCalendarView({ maxVisibleEvents: 0 }).maxVisibleEvents).toBe(1);
  });

  it("drops invalid override values back to inherit (omitted)", () => {
    const v = clampCalendarView({ weekNumbers: "yes", maxVisibleEvents: "lots" });
    expect("weekNumbers" in v).toBe(false);
    expect("maxVisibleEvents" in v).toBe(false);
  });

  it("setRegionView clears an override when patched with undefined", () => {
    const screens = normalizeDashboardScreens(
      screenWith({
        id: "r1",
        kind: "calendar",
        instanceIds: [],
        size: 100,
        view: { mode: "month", rolling: false, weeks: 4, days: 7, weekNumbers: true },
      })
    );
    expect(screens.screens[0].layout.regions[0].view.weekNumbers).toBe(true);
    const next = setRegionView(screens, "r1", { weekNumbers: undefined });
    expect("weekNumbers" in next.screens[0].layout.regions[0].view).toBe(false);
  });

  it("setRegionView merges + clamps a region's view on the active screen without mutating input", () => {
    const screens = normalizeDashboardScreens(
      screenWith({ id: "r1", kind: "calendar", instanceIds: [], size: 100 })
    );
    const next = setRegionView(screens, "r1", { mode: "week", rolling: true });
    expect(next.screens[0].layout.regions[0].view).toEqual({
      mode: "week",
      rolling: true,
      weeks: 4,
      days: 7,
      extraWeeks: 0,
    });
    // input is not mutated
    expect(screens.screens[0].layout.regions[0].view.mode).toBe("month");
  });

  it("setRegionView finds a calendar region nested in a split", () => {
    const screens = normalizeDashboardScreens({
      activeScreenId: "s1",
      screens: [
        {
          id: "s1",
          layout: {
            regions: [
              {
                id: "r1",
                kind: "calendar",
                size: 100,
                split: {
                  regions: [
                    { id: "r1-a", kind: "calendar", size: 50 },
                    { id: "r1-b", kind: "photos", size: 50 },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
    const next = setRegionView(screens, "r1-a", { mode: "day" });
    expect(next.screens[0].layout.regions[0].split.regions[0].view.mode).toBe("day");
  });
});

describe("clampServiceView", () => {
  it("keeps a valid linkAction override", () => {
    expect(clampServiceView({ linkAction: "embed" })).toEqual({ linkAction: "embed" });
    expect(clampServiceView({ linkAction: "handoff" })).toEqual({ linkAction: "handoff" });
    expect(clampServiceView({ linkAction: "off" })).toEqual({ linkAction: "off" });
  });

  it("omits an invalid or absent linkAction (inherit)", () => {
    expect(clampServiceView({})).toEqual({});
    expect(clampServiceView({ linkAction: "nope" })).toEqual({});
    expect("linkAction" in clampServiceView({ linkAction: undefined })).toBe(false);
  });
});

describe("setRegionView on a service region", () => {
  const screens = {
    activeScreenId: "s1",
    screens: [
      { id: "s1", layout: { regions: [{ id: "svc-1", kind: "service", instanceIds: ["mealie-1"] }] } },
    ],
  };

  it("applies a linkAction patch to a service region", () => {
    const next = setRegionView(screens, "svc-1", { linkAction: "embed" });
    expect(next.screens[0].layout.regions[0].view).toEqual({ linkAction: "embed" });
  });

  it("clears the override when linkAction is undefined", () => {
    const withOverride = setRegionView(screens, "svc-1", { linkAction: "embed" });
    const cleared = setRegionView(withOverride, "svc-1", { linkAction: undefined });
    expect(cleared.screens[0].layout.regions[0].view).toEqual({});
  });

  it("does not mutate the input", () => {
    setRegionView(screens, "svc-1", { linkAction: "off" });
    expect(screens.screens[0].layout.regions[0].view).toBeUndefined();
  });
});
