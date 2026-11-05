import { describe, expect, it } from "vitest";
import {
  buildClockBarDesign,
  defaultClockBarDesign,
  resolveClockBarDesign,
  showTileInDesign,
} from "@/utils/clockBarDesign";

const tile = (id, config = {}) => ({
  id,
  name: `Tile ${id}`,
  statusbar_schema: { kind: "status" },
  config,
});

const config = patch => ({ ...patch });

const shape = (result, name = "horizontal") => result[name];

describe("resolveClockBarDesign — legacy migration", () => {
  it("renders today's default bar when no key is stored", () => {
    const design = shape(resolveClockBarDesign(config({}), []));

    expect(design.zones).toEqual({
      left: ["logo", "room", "pageDots"],
      center: ["time"],
      right: ["status"],
    });
    expect(design.hidden).toEqual(["date"]);
    expect(design.parts.time.seconds).toBe(false);
    expect(design.parts.time.size).toBe("m");
    expect(design.parts.date.underTime).toBe(false);
    expect(design.barHeight).toBe("normal");
    expect(design.paddingPx).toBe(8);
    expect(design.tileSize).toBe("m");
    expect(design.tileSizePx).toBe(16);
  });

  it("shows the date where it sits today when clockShowDate is on", () => {
    const design = shape(resolveClockBarDesign(config({ clockShowDate: true }), []));

    expect(design.zones.center).toEqual(["time", "date"]);
    expect(design.hidden).not.toContain("date");
    expect(design.parts.date.visible).toBe(true);
  });

  it("maps clockShowSeconds to Time › Show seconds", () => {
    const design = shape(resolveClockBarDesign(config({ clockShowSeconds: true }), []));
    expect(design.parts.time.seconds).toBe(true);
  });

  it("maps clockBarShowLogo false to the logo on the Not shown shelf", () => {
    const design = shape(resolveClockBarDesign(config({ clockBarShowLogo: false }), []));

    expect(design.zones.left).not.toContain("logo");
    expect(design.hidden).toContain("logo");
  });

  it("maps clockBarLayout two-lines to Date › Under the time", () => {
    const design = shape(
      resolveClockBarDesign(config({ clockShowDate: true, clockBarLayout: "two-lines" }), [])
    );

    expect(design.parts.date.underTime).toBe(true);
    expect(design.parts.date.adjacentToTime).toBe(true);
  });

  it.each([
    ["upright", "upright", "line"],
    ["single-line", "upright", "line"],
    ["two-lines", "upright", "line"],
    ["compact-time", "stacked", "line"],
    ["compact-time-date", "stacked", "stacked"],
    ["vertical-compact", "stacked", "line"],
  ])(
    "maps clockBarVerticalLayout %s to time %s and date %s",
    (legacyLayout, timeStyle, dateStyle) => {
      const main = shape(
        resolveClockBarDesign(
          config({ clockShowDate: true, clockBarVerticalLayout: legacyLayout }),
          []
        ),
        "vertical"
      );

      expect(main.parts.time.style).toBe(timeStyle);
      expect(main.parts.date.style).toBe(dateStyle);
      // The side bar always puts the date under the time.
      expect(main.parts.date.underTime).toBe(true);
    }
  );

  it("reads the older vertical-compact clockBarLayout when the vertical key is unset", () => {
    const main = shape(
      resolveClockBarDesign(config({ clockBarLayout: "vertical-compact" }), []),
      "vertical"
    );
    expect(main.parts.time.style).toBe("stacked");
  });

  it("keeps the side bar's room name off by default, as today", () => {
    const main = shape(resolveClockBarDesign(config({}), []), "vertical");
    expect(main.zones).toEqual({
      top: ["logo", "pageDots"],
      middle: ["time"],
      bottom: ["status"],
    });
    expect(main.hidden).toContain("room");
    expect(main.hidden).toContain("date");
  });

  it.each([
    ["clockBarFontSize", 16, "m"],
    ["clockBarFontSize", 24, "l"],
    ["clockBarFontSize", 14, "s"],
    ["clockBarFontSize", 32, "xl"],
    ["clockBarFontSize", 22, 22],
  ])("maps horizontal %s %s to step %s", (key, value, expected) => {
    const design = shape(resolveClockBarDesign(config({ [key]: value }), []));
    expect(design.parts.time.size).toBe(expected);
    expect(design.parts.time.sizePx).toBe(value);
  });

  it.each([
    ["clockBarDateFontSize", 14, "m"],
    ["clockBarDateFontSize", 12, "s"],
    ["clockBarDateFontSize", 18, "l"],
  ])("maps horizontal %s %s to step %s", (key, value, expected) => {
    const design = shape(resolveClockBarDesign(config({ [key]: value }), []));
    expect(design.parts.date.size).toBe(expected);
    expect(design.parts.date.sizePx).toBe(value);
  });

  it.each([
    ["clockBarPadding", 4, "slim", 4],
    ["clockBarPadding", 8, "normal", 8],
    ["clockBarPadding", 12, "roomy", 12],
    ["clockBarPadding", 0, 0, 0],
    ["clockBarPadding", 10, 10, 10],
  ])("maps horizontal %s %s to bar height %s", (key, value, step, px) => {
    const design = shape(resolveClockBarDesign(config({ [key]: value }), []));
    expect(design.barHeight).toBe(step);
    expect(design.paddingPx).toBe(px);
  });

  it.each([
    ["clockBarPluginItemSize", 14, "s", 14],
    ["clockBarPluginItemSize", 16, "m", 16],
    ["clockBarPluginItemSize", 20, "l", 20],
  ])("maps horizontal %s %s to tile size %s", (key, value, step, px) => {
    const design = shape(resolveClockBarDesign(config({ [key]: value }), []));
    expect(design.tileSize).toBe(step);
    expect(design.tileSizePx).toBe(px);
  });

  it.each([
    ["clockBarVerticalFontSize", 18, "m", 18],
    ["clockBarVerticalFontSize", 28, "l", 28],
    ["clockBarVerticalFontSize", 36, "xl", 36],
    ["clockBarVerticalFontSize", 14, "s", 14],
  ])("maps vertical %s %s to step %s", (key, value, step, px) => {
    const main = shape(resolveClockBarDesign(config({ [key]: value }), []), "vertical");
    expect(main.parts.time.size).toBe(step);
    expect(main.parts.time.sizePx).toBe(px);
  });

  it.each([
    ["clockBarVerticalDateFontSize", 11, "m", 11],
    ["clockBarVerticalDateFontSize", 10, "s", 10],
    ["clockBarVerticalDateFontSize", 14, "l", 14],
    ["clockBarVerticalPadding", 4, "slim", 4],
    ["clockBarVerticalPadding", 12, "roomy", 12],
    ["clockBarVerticalPluginItemSize", 20, "l", 20],
  ])("maps vertical %s %s on the side bar", (key, value, step, px) => {
    const main = shape(resolveClockBarDesign(config({ [key]: value }), []), "vertical");
    const design = main;
    if (key.includes("Padding")) {
      expect(design.barHeight).toBe(step);
      expect(design.paddingPx).toBe(px);
    } else if (key.includes("Plugin")) {
      expect(design.tileSize).toBe(step);
      expect(design.tileSizePx).toBe(px);
    } else {
      expect(design.parts.date.size).toBe(step);
      expect(design.parts.date.sizePx).toBe(px);
    }
  });

  it("hides an instance whose show_in_statusbar is false", () => {
    const services = [tile("weather"), tile("recipes", { show_in_statusbar: false })];
    const design = shape(resolveClockBarDesign(config({}), services));

    expect(design.zones.right).toContain("tile:weather");
    expect(design.hidden).toContain("tile:recipes");
    expect(design.zones.right).not.toContain("tile:recipes");
  });

  it("keeps a shown instance when the flag is absent", () => {
    const design = shape(resolveClockBarDesign(config({}), [tile("weather")]));
    expect(design.zones.right).toContain("tile:weather");
  });
});

describe("resolveClockBarDesign — stored design", () => {
  const stored = patch => ({
    version: 1,
    horizontal: {
      zones: { left: ["logo"], center: ["time", "date"], right: ["tiles", "status"] },
      hidden: [],
      parts: { date: { underTime: true } },
      barHeight: "normal",
      tileSize: "m",
      ...patch,
    },
  });

  it("ignores the old keys once a design is stored", () => {
    const design = shape(
      resolveClockBarDesign(
        config({ clockBarDesign: stored(), clockShowDate: false, clockBarShowLogo: false }),
        []
      )
    );

    expect(design.zones.center).toContain("date");
    expect(design.zones.left).toContain("logo");
  });

  it("never hides Status & menu", () => {
    const design = shape(
      resolveClockBarDesign(config({ clockBarDesign: stored({ hidden: ["status"] }) }), [])
    );

    expect(design.zones.right).toContain("status");
    expect(design.hidden).not.toContain("status");
  });

  it("drops unknown ids, including a deleted instance", () => {
    const design = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({
            zones: { left: ["bogus", "tile:gone"], center: ["time"], right: ["status"] },
          }),
        }),
        [tile("weather")]
      )
    );

    expect(design.zones.left).toEqual([]);
    expect(design.zones.center).toEqual(["time"]);
    // No placeholder to inherit: a new instance joins the default zone.
    expect(design.zones.right).toContain("tile:weather");
  });

  it("puts a new instance where the tiles placeholder is", () => {
    const design = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({
            zones: { left: ["logo"], center: ["time"], right: ["tiles", "status"] },
          }),
        }),
        [tile("weather"), tile("recipes")]
      )
    );

    expect(design.zones.right).toEqual(["tile:weather", "tile:recipes", "status"]);
  });

  it("keeps Under the time only while Date directly follows Time", () => {
    const adjacent = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({
            zones: { left: ["logo"], center: ["time", "date"], right: ["tiles", "status"] },
            parts: { date: { underTime: true } },
          }),
        }),
        []
      )
    );
    expect(adjacent.parts.date.underTime).toBe(true);

    const separated = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({
            zones: { left: ["logo", "date"], center: ["time"], right: ["tiles", "status"] },
            parts: { date: { underTime: true } },
          }),
        }),
        []
      )
    );
    expect(separated.parts.date.underTime).toBe(false);
    expect(separated.parts.date.adjacentToTime).toBe(false);
  });

  it("hides an unlisted tile whose own flag is false", () => {
    const design = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({
            zones: { left: ["logo"], center: ["time"], right: ["tiles", "status"] },
          }),
        }),
        [tile("weather"), tile("recipes", { show_in_statusbar: false })]
      )
    );

    expect(design.zones.right).toContain("tile:weather");
    expect(design.hidden).toContain("tile:recipes");
  });

  it("resolves a custom size to its px value", () => {
    const design = shape(
      resolveClockBarDesign(
        config({
          clockBarDesign: stored({ parts: { time: { size: 21 } } }),
        }),
        []
      )
    );
    expect(design.parts.time.size).toBe(21);
    expect(design.parts.time.sizePx).toBe(21);
  });
});

describe("buildClockBarDesign", () => {
  it("compresses consecutive tiles in instance order back to the placeholder", () => {
    const resolved = resolveClockBarDesign(config({}), [tile("weather"), tile("recipes")]);
    const design = buildClockBarDesign(resolved);

    expect(design.horizontal.zones.right).toEqual(["tiles", "status"]);
  });

  it("keeps a pinned tile explicit when its order no longer matches the instance order", () => {
    const resolved = resolveClockBarDesign(config({}), [tile("weather"), tile("recipes")]);
    resolved.horizontal.zones.right = ["tile:recipes", "tile:weather", "status"];
    const design = buildClockBarDesign(resolved);

    expect(design.horizontal.zones.right).toEqual(["tile:recipes", "tile:weather", "status"]);
  });

  it("round-trips the default design", () => {
    const design = defaultClockBarDesign();
    const resolved = resolveClockBarDesign(config({ clockBarDesign: design }), []);
    expect(buildClockBarDesign(resolved)).toEqual(design);
  });

  it("removes an instance from the hidden shelf when Content adds it", () => {
    const design = defaultClockBarDesign();
    design.horizontal.hidden.push("tile:weather");
    const next = showTileInDesign(design, "weather");

    expect(next.horizontal.hidden).not.toContain("tile:weather");
    expect(design.horizontal.hidden).toContain("tile:weather");
  });
});
