import { describe, expect, it } from "vitest";
import {
  defaultSettingsCategoryId,
  filterSettingsDestinations,
  getSettingDestinationById,
  isKnownSettingsCategory,
  normalizeSettingsCategoryId,
  settingsCategories,
  settingsDestinations,
} from "@/components/settings/settingsRegistry";

describe("settings registry", () => {
  it("defines the seven settings categories in rail order", () => {
    expect(settingsCategories.map(category => category.id)).toEqual([
      "content",
      "dashboard",
      "device",
      "kiosks",
      "plugins",
      "maintenance",
      "security",
    ]);
    expect(settingsCategories.map(category => category.label)).toEqual([
      "Content",
      "Dashboard",
      "Screen & keyboard",
      "Kiosks",
      "Plugins",
      "System",
      "Security",
    ]);
    expect(defaultSettingsCategoryId).toBe("content");
  });

  it("keeps the destination ids stable", () => {
    expect(settingsDestinations.map(destination => destination.id)).toEqual([
      "dashboard-layout",
      "dashboard-regions",
      "dashboard-ui",
      "dashboard-kiosk",
      "clock-bar-appearance",
      "clock-bar-items",
      "content-calendars",
      "content-calendar-display",
      "content-photos",
      "content-images",
      "content-services",
      "plugins",
      "plugins-services",
      "kiosks",
      "kiosks-software",
      "device-power",
      "device-keyboard",
      "device-notifications",
      "device-reboot",
      "device-hardware",
      "security-admin",
      "maintenance-updates",
      "maintenance-backup",
      "maintenance-diagnostics",
    ]);
  });

  it("points every destination at a live category", () => {
    const categoryIds = new Set(settingsCategories.map(category => category.id));
    for (const destination of settingsDestinations) {
      expect(categoryIds.has(destination.category), destination.id).toBe(true);
      expect(destination.category).not.toBe("clock-bar");
    }
  });

  it("validates category ids and resolves the retired clock-bar alias", () => {
    expect(isKnownSettingsCategory("dashboard")).toBe(true);
    expect(isKnownSettingsCategory("content")).toBe(true);
    expect(isKnownSettingsCategory("clock-bar")).toBe(true);
    expect(normalizeSettingsCategoryId("clock-bar")).toBe("dashboard");
    expect(normalizeSettingsCategoryId("content")).toBe("content");
    expect(normalizeSettingsCategoryId("missing")).toBeNull();
    expect(isKnownSettingsCategory(null)).toBe(false);
  });

  it("moves destinations to their new categories", () => {
    expect(getSettingDestinationById("dashboard-layout")).toMatchObject({
      category: "device",
      tab: "layout",
      tabKey: "settings_tab_device",
      path: "Screen & keyboard / Screen orientation",
    });
    expect(getSettingDestinationById("dashboard-regions")).toMatchObject({
      category: "dashboard",
      path: "Dashboard / Screens & regions",
    });
    expect(getSettingDestinationById("clock-bar-appearance")).toMatchObject({
      category: "dashboard",
      tab: "clock",
      tabKey: "settings_tab_dashboard",
      path: "Dashboard / Clock",
    });
    expect(getSettingDestinationById("clock-bar-items")).toMatchObject({
      category: "dashboard",
      tab: "bar-items",
      tabKey: "settings_tab_dashboard",
      path: "Dashboard / Clock bar items",
    });
    expect(getSettingDestinationById("device-hardware")).toMatchObject({
      category: "maintenance",
      tab: "hardware",
      tabKey: "settings_tab_maintenance",
      path: "System / Versions & status",
    });
    expect(getSettingDestinationById("device-notifications")).toMatchObject({
      category: "device",
      path: "Screen & keyboard / Key-press feedback",
    });
  });

  it("resolves Add a web page to Content / Web pages & services", () => {
    expect(getSettingDestinationById("plugins-services")).toMatchObject({
      category: "content",
      tab: "content-services",
      tabKey: "settings_tab_content_sources",
      label: "Add a web page",
    });
  });

  it("searches labels, paths, and keywords under the new names", () => {
    expect(filterSettingsDestinations("seconds").map(item => item.id)).toEqual([
      "clock-bar-appearance",
    ]);
    expect(filterSettingsDestinations("tiles").map(item => item.id)).toEqual(["clock-bar-items"]);
    expect(filterSettingsDestinations("github").map(item => item.id)).toEqual(["plugins"]);

    // Old names still find their new home.
    expect(filterSettingsDestinations("clock bar").map(item => item.id)).toContain(
      "clock-bar-items"
    );
    expect(filterSettingsDestinations("display").map(item => item.id)).toContain(
      "dashboard-layout"
    );
    expect(filterSettingsDestinations("maintenance").map(item => item.id)).toContain(
      "maintenance-updates"
    );
    expect(filterSettingsDestinations("notifications").map(item => item.id)).toEqual([
      "device-notifications",
    ]);
    expect(filterSettingsDestinations("content sources").map(item => item.id)).toContain(
      "content-services"
    );
  });

  it("resolves kiosk software to the Kiosks category and section", () => {
    expect(getSettingDestinationById("kiosks-software")).toMatchObject({
      label: "Update kiosk software",
      path: "Kiosks / Kiosk software",
      category: "kiosks",
      section: "kiosks-list",
    });
    expect(filterSettingsDestinations("fleet").map(item => item.id)).toContain("kiosks-software");
    expect(filterSettingsDestinations("kiosk update").map(item => item.id)).toContain(
      "maintenance-updates"
    );
  });

  it("limits search results", () => {
    expect(filterSettingsDestinations("display", 2)).toHaveLength(2);
  });
});
