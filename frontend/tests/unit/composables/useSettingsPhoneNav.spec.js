import { describe, it, expect } from "vitest";
import { openQuery, upQuery } from "@/composables/useSettingsPhoneNav";

describe("phone Settings page stack", () => {
  it("steps up one level at a time", () => {
    const deep = { category: "screens", screen: "hallway", section: "screen-look" };
    expect(upQuery(deep)).toEqual({ category: "screens", screen: "hallway" });
    expect(upQuery({ category: "screens", screen: "hallway" })).toEqual({ category: "screens" });
    expect(upQuery({ category: "screens" })).toEqual({});
  });

  it("drops a search deep link on the way up, and keeps unrelated keys", () => {
    expect(upQuery({ category: "content", setting: "calendar-basics", kiosk: "k1" })).toEqual({
      kiosk: "k1",
    });
    expect(upQuery({ setting: "device-power" })).toEqual({});
  });

  it("opens a level below the ones above it and closes the ones below", () => {
    const deep = { category: "screens", screen: "hallway", section: "screen-look", kiosk: "k1" };
    expect(openQuery(deep, { screen: "default" })).toEqual({
      category: "screens",
      screen: "default",
      kiosk: "k1",
    });
    expect(openQuery({ category: "content" }, { section: "content-photos" })).toEqual({
      category: "content",
      section: "content-photos",
    });
  });

  it("opens a screen at a section in one step, and ignores empty values", () => {
    expect(
      openQuery(
        { category: "screens", setting: "device-power" },
        { screen: "default", section: "device-power" }
      )
    ).toEqual({ category: "screens", screen: "default", section: "device-power" });
    expect(openQuery({ category: "screens" }, { screen: "default", section: null })).toEqual({
      category: "screens",
      screen: "default",
    });
  });
});
