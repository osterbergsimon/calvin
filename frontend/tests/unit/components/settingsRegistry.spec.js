import { describe, expect, it } from "vitest";
import {
  defaultSettingsCategoryId,
  filterSettingsDestinations,
  getSettingDestinationById,
  isKnownSettingsCategory,
  settingsCategories,
} from "@/components/settings/settingsRegistry";

describe("settings registry", () => {
  it("defines the primary settings categories in display order", () => {
    expect(settingsCategories.map(category => category.id)).toEqual([
      "dashboard",
      "clock-bar",
      "content",
      "plugins",
      "device",
      "kiosks",
      "maintenance",
      "security",
    ]);
    expect(defaultSettingsCategoryId).toBe("dashboard");
  });

  it("validates known category ids", () => {
    expect(isKnownSettingsCategory("dashboard")).toBe(true);
    expect(isKnownSettingsCategory("clock-bar")).toBe(true);
    expect(isKnownSettingsCategory("missing")).toBe(false);
    expect(isKnownSettingsCategory(null)).toBe(false);
  });

  it("resolves destinations by stable id", () => {
    expect(getSettingDestinationById("clock-bar-appearance")).toMatchObject({
      category: "clock-bar",
      tab: "appearance",
      tabKey: "settings_tab_clock_bar",
    });
    expect(getSettingDestinationById("clock-bar-items")).toMatchObject({
      category: "clock-bar",
      tab: "bar-items",
      tabKey: "settings_tab_clock_bar",
    });
  });

  it("searches labels, paths, and keywords", () => {
    expect(filterSettingsDestinations("seconds").map(item => item.id)).toEqual([
      "clock-bar-appearance",
    ]);
    expect(filterSettingsDestinations("tiles").map(item => item.id)).toEqual(["clock-bar-items"]);
    expect(filterSettingsDestinations("github").map(item => item.id)).toEqual(["plugins"]);
  });

  it("limits search results", () => {
    expect(filterSettingsDestinations("display", 2)).toHaveLength(2);
  });
});
