import { describe, expect, it } from "vitest";
import {
  CLOCK_BAR_SIZE_STEPS,
  clockBarBarHeightPx,
  clockBarPartSizePx,
  deriveClockBarDesign,
  expandClockBarZone,
  groupClockBarZone,
  resolveClockBarDesign,
  toStoredClockBarDesign,
} from "@/utils/clockBarDesign";

const service = (id, showInStatusbar, order = 0) => ({
  id,
  display_order: order,
  statusbar_schema: { kind: "status", label: id },
  config: showInStatusbar === undefined ? {} : { show_in_statusbar: showInStatusbar },
});

const services = [
  service("weather", true, 1),
  service("energy", false, 2),
  service("laundry", true, 3),
];

const oldConfig = (overrides = {}) => ({
  clockShowDate: false,
  clockShowSeconds: false,
  clockBarShowLogo: true,
  clockBarLayout: "single-line",
  clockBarVerticalLayout: "upright",
  clockBarFontSize: 16,
  clockBarDateFontSize: 14,
  clockBarPadding: 8,
  clockBarPluginItemSize: 16,
  clockBarVerticalFontSize: 18,
  clockBarVerticalDateFontSize: 11,
  clockBarVerticalPadding: 8,
  clockBarVerticalPluginItemSize: 16,
  ...overrides,
});

describe("clockBarDesign resolver — old-key parity", () => {
  it("derives today's top bar when every old key is default", () => {
    const design = deriveClockBarDesign(oldConfig(), services);

    expect(design.horizontal.zones).toEqual({
      left: ["logo", "room", "pageDots"],
      center: ["time"],
      right: ["tiles", "status"],
    });
    expect(design.horizontal.hidden).toEqual(["date", "tile:energy"]);
    expect(design.horizontal.parts.time).toMatchObject({ size: "m", seconds: false });
    expect(design.horizontal.parts.date).toMatchObject({ size: "m", underTime: false });
    expect(design.horizontal.barHeight).toBe("normal");
    expect(design.horizontal.tileSize).toBe("m");
    expect(expandClockBarZone(design, "horizontal", "right")).toEqual([
      "tile:weather",
      "tile:laundry",
      "status",
    ]);
  });

  it("maps each old top-bar key", () => {
    const cases = [
      [{ clockShowDate: true }, d => expect(d.horizontal.zones.center).toEqual(["time", "date"])],
      [{ clockShowDate: true }, d => expect(d.horizontal.hidden).not.toContain("date")],
      [{ clockShowSeconds: true }, d => expect(d.horizontal.parts.time.seconds).toBe(true)],
      [{ clockBarShowLogo: false }, d => expect(d.horizontal.hidden).toContain("logo")],
      [{ clockBarShowLogo: true }, d => expect(d.horizontal.zones.left).toContain("logo")],
      [{ clockBarLayout: "two-lines" }, d => expect(d.horizontal.parts.date.underTime).toBe(true)],
      [
        { clockBarLayout: "single-line" },
        d => expect(d.horizontal.parts.date.underTime).toBe(false),
      ],
    ];
    for (const [overrides, assert] of cases) {
      assert(deriveClockBarDesign(oldConfig(overrides), services));
    }
  });

  it("maps the px size keys to steps, and anything else to a Custom number", () => {
    const sizes = deriveClockBarDesign(
      oldConfig({
        clockBarFontSize: 24,
        clockBarDateFontSize: 18,
        clockBarPadding: 12,
        clockBarPluginItemSize: 20,
      }),
      services
    );
    expect(sizes.horizontal.parts.time.size).toBe("l");
    expect(sizes.horizontal.parts.date.size).toBe("l");
    expect(sizes.horizontal.barHeight).toBe("roomy");
    expect(sizes.horizontal.tileSize).toBe("l");
    expect(clockBarPartSizePx(sizes, "horizontal", "time")).toBe(24);
    expect(clockBarBarHeightPx(sizes, "horizontal")).toBe(12);

    const custom = deriveClockBarDesign(oldConfig({ clockBarFontSize: 21 }), services);
    expect(custom.horizontal.parts.time.size).toBe(21);
    expect(clockBarPartSizePx(custom, "horizontal", "time")).toBe(21);
  });

  it("derives today's side bar, including its hidden room name", () => {
    const design = deriveClockBarDesign(oldConfig({ clockShowDate: true }), services);

    expect(design.vertical.zones).toEqual({
      top: ["logo", "pageDots"],
      middle: ["time", "date"],
      bottom: ["tiles", "status"],
    });
    expect(design.vertical.hidden).toEqual(["room", "tile:energy"]);
    expect(design.vertical.parts.time).toMatchObject({ size: "m", style: "upright" });
    expect(design.vertical.parts.date).toMatchObject({ size: "m", style: "line" });
    expect(expandClockBarZone(design, "vertical", "bottom")).toEqual([
      "tile:weather",
      "tile:laundry",
      "status",
    ]);
  });

  it("maps every old side-bar layout", () => {
    const layout = value =>
      deriveClockBarDesign(oldConfig({ clockBarVerticalLayout: value }), services).vertical.parts;

    expect(layout("upright").time.style).toBe("upright");
    expect(layout("single-line").time.style).toBe("upright");
    expect(layout("two-lines").time.style).toBe("upright");
    expect(layout("compact-time").time.style).toBe("stacked");
    expect(layout("compact-time").date.style).toBe("line");
    expect(layout("compact-time-date").time.style).toBe("stacked");
    expect(layout("compact-time-date").date.style).toBe("stacked");
    expect(layout("vertical-compact").time.style).toBe("stacked");
  });

  it("maps the side-bar px size keys to their own step table", () => {
    const design = deriveClockBarDesign(
      oldConfig({
        clockBarVerticalFontSize: 28,
        clockBarVerticalDateFontSize: 14,
        clockBarVerticalPadding: 12,
        clockBarVerticalPluginItemSize: 20,
      }),
      services
    );
    expect(design.vertical.parts.time.size).toBe("l");
    expect(design.vertical.parts.date.size).toBe("l");
    expect(design.vertical.barHeight).toBe("roomy");
    expect(design.vertical.tileSize).toBe("l");
  });

  it("hides a tile whose old show_in_statusbar flag is false, and shows it again when true", () => {
    const hidden = deriveClockBarDesign(oldConfig(), services);
    expect(hidden.horizontal.hidden).toContain("tile:energy");
    expect(expandClockBarZone(hidden, "horizontal", "right")).not.toContain("tile:energy");

    const shown = deriveClockBarDesign(
      oldConfig(),
      [service("energy", true), service("weather", undefined)]
    );
    expect(shown.horizontal.hidden).not.toContain("tile:energy");
    expect(expandClockBarZone(shown, "horizontal", "right")).toEqual([
      "tile:energy",
      "tile:weather",
      "status",
    ]);
  });

  it("expands a new instance where the tiles placeholder is", () => {
    const design = deriveClockBarDesign(oldConfig(), services);
    const next = [service("newcomer", true, 4), ...services];
    const resolved = resolveClockBarDesign({ clockBarDesign: design, services: next }, next);
    expect(expandClockBarZone(resolved, "horizontal", "right")).toContain("tile:newcomer");
  });

  it("drops a deleted instance id when the design is read", () => {
    const stored = {
      version: 1,
      horizontal: {
        zones: { left: ["logo"], center: ["time"], right: ["tile:gone", "status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
      vertical: {
        zones: { top: [], middle: [], bottom: ["status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
    };
    const design = resolveClockBarDesign({ clockBarDesign: stored }, services);
    expect(design.horizontal.zones.right).not.toContain("tile:gone");
    expect(design.horizontal.zones.right).toEqual(["status"]);
  });

  it("keeps Status & menu reachable even when the stored design hides it", () => {
    const stored = {
      version: 1,
      horizontal: {
        zones: { left: [], center: [], right: [] },
        hidden: ["status"],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
      vertical: {
        zones: { top: [], middle: [], bottom: [] },
        hidden: ["status"],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
    };
    const design = resolveClockBarDesign({ clockBarDesign: stored }, services);
    expect(design.horizontal.hidden).not.toContain("status");
    expect(design.vertical.hidden).not.toContain("status");
    expect(design.horizontal.zones.right).toContain("status");
    expect(design.vertical.zones.bottom).toContain("status");
  });

  it("lets a listed tile win over the old show_in_statusbar flag", () => {
    const stored = {
      version: 1,
      horizontal: {
        zones: { left: [], center: ["time"], right: ["tile:energy", "status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
      vertical: {
        zones: { top: [], middle: [], bottom: ["status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
    };
    const design = resolveClockBarDesign({ clockBarDesign: stored }, services);
    expect(expandClockBarZone(design, "horizontal", "right")).toContain("tile:energy");
  });

  it("starts an unlisted old-hidden tile on the shelf even with a stored design", () => {
    const stored = {
      version: 1,
      horizontal: {
        zones: { left: [], center: ["time"], right: ["tiles", "status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
      vertical: {
        zones: { top: [], middle: [], bottom: ["status"] },
        hidden: [],
        parts: {},
        barHeight: "normal",
        tileSize: "m",
      },
    };
    const design = resolveClockBarDesign({ clockBarDesign: stored }, services);
    expect(design.horizontal.hidden).toContain("tile:energy");
    expect(expandClockBarZone(design, "horizontal", "right")).not.toContain("tile:energy");
  });

  it("only stacks Date under Time when it directly follows Time in the same zone", () => {
    const design = deriveClockBarDesign(
      oldConfig({ clockShowDate: true, clockBarLayout: "two-lines" }),
      services
    );
    expect(groupClockBarZone(design, "horizontal", "center")).toEqual([
      { kind: "stack", parts: ["time", "date"] },
    ]);

    design.horizontal.zones.center = ["time", "logo", "date"];
    expect(groupClockBarZone(design, "horizontal", "center")).toEqual([
      { kind: "part", id: "time" },
      { kind: "part", id: "logo" },
      { kind: "part", id: "date" },
    ]);
  });

  it("strips the resolver metadata before the design is written", () => {
    const design = deriveClockBarDesign(oldConfig(), services);
    expect(toStoredClockBarDesign(design)).toEqual({
      version: 1,
      horizontal: design.horizontal,
      vertical: design.vertical,
    });
    expect(toStoredClockBarDesign(design).tileIds).toBeUndefined();
  });

  it("uses three size steps as the spec's S/M/L mapping, with M equal to today", () => {
    expect(CLOCK_BAR_SIZE_STEPS).toEqual(["s", "m", "l", "xl"]);
    expect(clockBarPartSizePx({ horizontal: { parts: { time: { size: "m" } } } }, "horizontal", "time")).toBe(16);
  });
});
