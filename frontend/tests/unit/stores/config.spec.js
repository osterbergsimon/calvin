/** Tests for config store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";
import axios from "axios";

// Mock axios
vi.mock("axios");

describe("Config Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("should initialize with default values", () => {
    const store = useConfigStore();

    expect(store.orientation).toBe("landscape");
    expect(store.calendarSplit).toBe(70);
    expect(store.showUI).toBe(true);
    expect(store.weekStartDay).toBe(1); // Monday default
  });

  it("should set orientation", () => {
    const store = useConfigStore();

    store.setOrientation("portrait");
    expect(store.orientation).toBe("portrait");
  });

  it("should set calendar split and clamp values", () => {
    const store = useConfigStore();

    // Test normal value
    store.setCalendarSplit(72);
    expect(store.calendarSplit).toBe(72);

    // Test clamping to minimum (10)
    store.setCalendarSplit(5);
    expect(store.calendarSplit).toBe(10);

    // Test clamping to maximum (90)
    store.setCalendarSplit(100);
    expect(store.calendarSplit).toBe(90);
  });

  it("should calculate calendar and photos width", () => {
    const store = useConfigStore();
    store.setCalendarSplit(70);

    expect(store.calendarWidth).toBe("70%");
    expect(store.photosWidth).toBe("30%");
  });

  it("should fetch config from API", async () => {
    const mockConfig = {
      orientation: "portrait",
      calendarSplit: 75,
      showUI: false,
    };

    axios.get.mockResolvedValue({ data: mockConfig });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(axios.get).toHaveBeenCalledWith("/api/config");
    expect(store.orientation).toBe("portrait");
    expect(store.calendarSplit).toBe(75);
    expect(store.showUI).toBe(false);
  });

  it("should hydrate snake_case aliases and parse JSON schedule values", async () => {
    const schedule = [{ day: 0, enabled: false, onTime: "07:30", offTime: "21:00" }];
    axios.get.mockResolvedValue({
      data: {
        apply_display_rotation: false,
        calendar_refresh_interval: 5,
        display_schedule: JSON.stringify(schedule),
        clock_bar_show_in_kiosk: true,
        console_log_level: "debug",
      },
    });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.applyDisplayRotation).toBe(false);
    expect(store.calendarRefreshInterval).toBe(5);
    expect(store.displaySchedule).toEqual(schedule);
    expect(store.clockBarShowInKiosk).toBe(true);
    expect(store.consoleLogLevel).toBe("debug");
  });

  it("should normalize dashboard layout and screens through the config registry", async () => {
    axios.get.mockResolvedValue({
      data: {
        calendar_split: 60,
        last_side_view_mode: "web_services",
        dashboard_layout: null,
        dashboard_screens: {
          version: 2,
          activeScreenId: "services",
          screens: [
            {
              id: "services",
              name: "Services",
              layout: {
                version: 1,
                preset: "split_two",
                regions: [
                  { id: "region-1", kind: "calendar", size: 50 },
                  { id: "region-2", kind: "service", size: 50 },
                ],
              },
              activeRegionId: "region-2",
            },
          ],
        },
      },
    });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.dashboardLayout.regions).toEqual([
      { id: "region-1", kind: "calendar", serviceId: null, size: 60, split: null },
      { id: "region-2", kind: "service", serviceId: null, size: 40, split: null },
    ]);
    expect(store.dashboardScreens.activeScreenId).toBe("services");
    expect(store.dashboardScreens.screens[0].activeRegionId).toBe("region-2");
  });

  it("should apply defaults for missing values after fetch", async () => {
    axios.get.mockResolvedValue({ data: { orientation: "portrait" } });

    const store = useConfigStore();
    store.setLastSideViewMode("web_services");
    await store.fetchConfig();

    expect(store.orientation).toBe("portrait");
    expect(store.lastSideViewMode).toBe("photos");
    expect(store.timezone).toBeNull();
  });

  it("should update config via API", async () => {
    const updateData = {
      orientation: "landscape",
      calendarSplit: 72,
    };

    const mockResponse = {
      orientation: "landscape",
      calendarSplit: 72,
      showUI: true,
    };

    axios.post.mockResolvedValue({ data: mockResponse });

    const store = useConfigStore();
    await store.updateConfig(updateData);

    expect(axios.post).toHaveBeenCalledWith("/api/config", updateData);
    expect(store.orientation).toBe("landscape");
    expect(store.calendarSplit).toBe(72);
  });

  it("should update all registered config fields from camelCase or snake_case payloads", async () => {
    axios.post.mockResolvedValue({ data: { show_ui: true, clock_bar_padding: 12 } });

    const store = useConfigStore();
    await store.updateConfig({
      apply_display_rotation: false,
      displaySchedule: [{ day: 1, enabled: true, onTime: "08:00", offTime: "20:00" }],
      clockBarShowWeather: true,
      clockBarShowLogo: false,
    });

    expect(store.applyDisplayRotation).toBe(false);
    expect(store.displaySchedule[0].day).toBe(1);
    expect(store.clockBarShowWeather).toBe(true);
    expect(store.clockBarShowLogo).toBe(false);
    expect(store.showUI).toBe(true);
    expect(store.clockBarPadding).toBe(12);
  });

  it("should handle API errors gracefully", async () => {
    const error = new Error("Network error");
    axios.get.mockRejectedValue(error);

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.error).toBe("Network error");
    expect(store.loading).toBe(false);
  });
});
