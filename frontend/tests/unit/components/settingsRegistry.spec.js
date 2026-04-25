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
    expect(settingsCategories.map((category) => category.id)).toEqual([
      "dashboard",
      "content",
      "plugins",
      "device",
      "maintenance",
    ]);
    expect(defaultSettingsCategoryId).toBe("dashboard");
  });

  it("validates known category ids", () => {
    expect(isKnownSettingsCategory("dashboard")).toBe(true);
    expect(isKnownSettingsCategory("missing")).toBe(false);
    expect(isKnownSettingsCategory(null)).toBe(false);
  });

  it("resolves destinations by stable id", () => {
    expect(getSettingDestinationById("dashboard-clock")).toMatchObject({
      category: "dashboard",
      tab: "clock",
      tabKey: "settings_tab_dashboard",
    });
  });

  it("searches labels, paths, and keywords", () => {
    expect(
      filterSettingsDestinations("seconds").map((item) => item.id),
    ).toEqual(["dashboard-clock"]);
    expect(filterSettingsDestinations("github").map((item) => item.id)).toEqual(
      ["plugins"],
    );
  });

  it("limits search results", () => {
    expect(filterSettingsDestinations("display", 2)).toHaveLength(2);
  });
});
