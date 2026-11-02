import { describe, it, expect } from "vitest";
import {
  CLOCK_BAR_SIZE_OPTIONS,
  clockBarSizePatch,
  clockBarSizePreset,
  clockBarSizeValues,
} from "@/utils/clockBarSizes";

describe("clockBarSizes", () => {
  it("offers Small, Medium, Large and Custom", () => {
    expect(CLOCK_BAR_SIZE_OPTIONS.map(option => option.label)).toEqual([
      "Small",
      "Medium",
      "Large",
      "Custom",
    ]);
  });

  it("matches a bar whose three values are a preset", () => {
    const medium = clockBarSizeValues("medium", "horizontal");
    expect(clockBarSizePreset(medium, "horizontal")).toBe("medium");
  });

  it("says Custom for any other value", () => {
    expect(clockBarSizePreset({ time: 16, padding: 8, plugin: 17 }, "horizontal")).toBe("custom");
  });

  it("reads a stored bar through its plugin item size too", () => {
    expect(clockBarSizePreset({ time: 18, padding: 8, plugin: 16 }, "vertical")).toBe("medium");
    expect(clockBarSizePreset({ time: 18, padding: 8, plugin: 16 }, "horizontal")).toBe("custom");
  });

  it("writes time, date, padding and plugin size for a preset", () => {
    expect(clockBarSizeValues("large", "horizontal")).toEqual({
      time: 24,
      date: 18,
      padding: 12,
      plugin: 20,
    });
  });

  it("falls back to Custom for an unknown name", () => {
    expect(clockBarSizeValues("huge", "horizontal")).toBeNull();
  });

  it("maps the editor fields to the stored config keys per bar", () => {
    expect(clockBarSizePatch({ time: 20, padding: 6, plugin: 18 }, "horizontal")).toEqual({
      clockBarFontSize: 20,
      clockBarPadding: 6,
      clockBarPluginItemSize: 18,
    });
    expect(clockBarSizePatch({ time: 22, date: 12 }, "vertical")).toEqual({
      clockBarVerticalFontSize: 22,
      clockBarVerticalDateFontSize: 12,
    });
  });
});
