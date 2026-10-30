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
  it("defines the six settings categories in rail order", () => {
    expect(settingsCategories.map(category => category.id)).toEqual([
      "content",
      "dashboard",
      "screens",
      "plugins",
      "maintenance",
      "security",
    ]);
    expect(settingsCategories.map(category => category.label)).toEqual([
      "Content",
      "Dashboard",
      "Screens",
      "Plugins",
      "System",
      "Security",
    ]);
    expect(settingsCategories.find(category => category.id === "screens")).toMatchObject({
      icon: "📺",
      subtitle: "Pages · rotation · power · touch",
    });
    expect(defaultSettingsCategoryId).toBe("content");
  });

  it("resolves the Plugins deep links the Content picker sends", () => {
    // "Get more in Plugins ›" and "See details in Plugins ›" both navigate with
    // ?setting=plugins-install; without a destination they opened no category.
    expect(getSettingDestinationById("plugins-install")).toMatchObject({
      category: "plugins",
      section: "plugins-install",
    });
    expect(getSettingDestinationById("plugins-installed")).toMatchObject({
      category: "plugins",
      section: "plugins-installed",
    });
  });

  it("keeps the destination ids stable", () => {
    expect(settingsDestinations.map(destination => destination.id)).toEqual([
      "screens-default",
      "dashboard-layout",
      "dashboard-regions",
      "dashboard-ui",
      "dashboard-kiosk",
      "dashboard-kiosk-focus",
      "clock-bar-appearance",
      "clock-bar-items",
      "content-calendars",
      "content-calendar-display",
      "content-photos",
      "content-images",
      "content-services",
      "content-clock-bar",
      "plugins",
      "plugins-install",
      "plugins-installed",
      "plugins-services",
      "kiosks",
      "kiosks-software",
      "device-power",
      "device-keyboard",
      "device-notifications",
      "device-reboot",
      "device-hardware",
      "security-admin",
      "security-api-keys",
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
      expect(destination.category).not.toBe("device");
      expect(destination.category).not.toBe("kiosks");
    }
  });

  it("validates category ids and resolves the retired category aliases", () => {
    expect(isKnownSettingsCategory("screens")).toBe(true);
    expect(isKnownSettingsCategory("dashboard")).toBe(true);
    expect(isKnownSettingsCategory("content")).toBe(true);
    expect(isKnownSettingsCategory("clock-bar")).toBe(true);
    // Deep links and phone QR codes from before the merge still resolve.
    expect(isKnownSettingsCategory("device")).toBe(true);
    expect(isKnownSettingsCategory("kiosks")).toBe(true);
    expect(normalizeSettingsCategoryId("clock-bar")).toBe("dashboard");
    expect(normalizeSettingsCategoryId("device")).toBe("screens");
    expect(normalizeSettingsCategoryId("kiosks")).toBe("screens");
    expect(normalizeSettingsCategoryId("content")).toBe("content");
    expect(normalizeSettingsCategoryId("missing")).toBeNull();
    expect(isKnownSettingsCategory(null)).toBe(false);
  });

  it("finds the Default page with the old All-screens words", () => {
    const byId = getSettingDestinationById("screens-default");
    expect(byId).toMatchObject({
      category: "screens",
      section: "layout",
      path: "Screens / Default",
    });
    expect(byId.keywords).toEqual(expect.arrayContaining(["all screens", "default", "shared"]));
    expect(filterSettingsDestinations("all screens")).toContainEqual(
      expect.objectContaining({ id: "screens-default" })
    );
  });

  it("moves destinations to their new categories", () => {
    expect(getSettingDestinationById("dashboard-layout")).toMatchObject({
      category: "screens",
      section: "layout",
      path: "Screens / Default · Display",
    });
    expect(getSettingDestinationById("dashboard-regions")).toMatchObject({
      category: "dashboard",
      path: "Dashboard / Pages & regions",
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
    // Remote & buttons and key-press feedback moved to Dashboard › Focus & remote.
    expect(getSettingDestinationById("device-notifications")).toMatchObject({
      category: "dashboard",
      section: "kiosk-touch-focus",
      path: "Dashboard / Focus & remote",
    });
    expect(getSettingDestinationById("device-power")).toMatchObject({
      category: "screens",
      section: "device-power",
      path: "Screens / Default · Power",
    });
    expect(getSettingDestinationById("device-reboot")).toMatchObject({
      category: "screens",
      section: "device-power",
      path: "Screens / Default · Power",
    });
    expect(getSettingDestinationById("device-keyboard")).toMatchObject({
      category: "screens",
      section: "device-keyboard",
      path: "Screens / Default · Touch & keyboard",
    });
  });

  it("resolves Add a web page to Content / Web pages & apps", () => {
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
    // "github" is a plugin-install word; the update source now lives in Advanced.
    expect(filterSettingsDestinations("github").map(item => item.id)).toContain("plugins");

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
    expect(filterSettingsDestinations("notifications").map(item => item.id)).toContain(
      "device-notifications"
    );
    expect(filterSettingsDestinations("touchscreen").map(item => item.id)).toContain(
      "device-keyboard"
    );
    expect(filterSettingsDestinations("content sources").map(item => item.id)).toContain(
      "content-services"
    );
    expect(filterSettingsDestinations("weather").map(item => item.id)).toContain(
      "content-clock-bar"
    );
    // The old category words still find a screen setting.
    expect(filterSettingsDestinations("kiosk").map(item => item.id)).toContain("kiosks");
  });

  it("resolves kiosk software to the Screens category and list section", () => {
    expect(getSettingDestinationById("kiosks-software")).toMatchObject({
      label: "Update kiosk software",
      path: "Screens / Kiosk software",
      category: "screens",
      section: "screens-list",
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
