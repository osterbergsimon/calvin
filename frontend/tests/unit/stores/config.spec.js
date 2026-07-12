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
      {
        id: "region-1",
        kind: "calendar",
        serviceId: null,
        instanceIds: [],
        size: 60,
        split: null,
        view: { mode: "month", rolling: false, weeks: 4, days: 7, extraWeeks: 0 },
      },
      {
        id: "region-2",
        kind: "service",
        serviceId: null,
        instanceIds: [],
        size: 40,
        split: null,
        view: {},
      },
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
      clockBarShowPluginItems: true,
      clockBarShowLogo: false,
    });

    expect(store.applyDisplayRotation).toBe(false);
    expect(store.displaySchedule[0].day).toBe(1);
    expect(store.clockBarShowPluginItems).toBe(true);
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

function setSearch(search) {
  Object.defineProperty(window, "location", { value: { search, hostname: "pi" }, writable: true });
}

const SCREENS = {
  version: 2,
  activeScreenId: "b",
  screens: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("config store — kiosk active screen", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Mode A: effectiveDashboardScreens == normalized global, no filtering", () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    expect(store.effectiveDashboardScreens.screens.map(s => s.id)).toEqual(["a", "b", "c"]);
    expect(store.effectiveDashboardScreens.activeScreenId).toBe("b");
  });

  it("kiosk mode: filters to availableScreens and overrides active to kioskActiveScreenId", () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    store.availableScreens = ["a", "c"];
    store.defaultScreenId = "c";
    store.seedKioskActiveScreen();
    expect(store.kioskActiveScreenId).toBe("c");
    expect(store.effectiveDashboardScreens.screens.map(s => s.id)).toEqual(["a", "c"]);
    expect(store.effectiveDashboardScreens.activeScreenId).toBe("c");
  });

  it("seed keeps a still-valid current across re-seed (poll does not clobber)", () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    store.availableScreens = null;
    store.defaultScreenId = "c";
    store.seedKioskActiveScreen(); // -> "c"
    store.kioskActiveScreenId = "a"; // user switched
    store.seedKioskActiveScreen(); // simulate next poll
    expect(store.kioskActiveScreenId).toBe("a"); // preserved
  });
});

describe("config store — switch actions branch on kiosk mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Reset call counts then set up resolved value so Mode A tests don't throw.
    vi.clearAllMocks();
    axios.post.mockResolvedValue({ data: {} });
  });

  it("kiosk mode: activate updates local id, no updateConfig network call", async () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    store.kioskActiveScreenId = "a";
    await store.activateDashboardScreen("c");
    expect(store.kioskActiveScreenId).toBe("c");
    // Spy on real network layer — vacuous store-proxy spy replaced with genuine guard.
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("kiosk mode: cycle updates local id among available, no updateConfig", async () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    store.availableScreens = ["a", "c"];
    store.kioskActiveScreenId = "a";
    await store.cycleDashboardScreenBy(1);
    expect(store.kioskActiveScreenId).toBe("c"); // next available after "a" is "c"
    // Spy on real network layer — vacuous store-proxy spy replaced with genuine guard.
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("Mode A: activate still persists via updateConfig (regression)", async () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    // Note: in Pinia setup stores, internal calls go via closure (not the proxy),
    // so we spy on axios.post instead of store.updateConfig to verify persistence.
    const spy = vi.spyOn(axios, "post");
    await store.activateDashboardScreen("c");
    expect(spy).toHaveBeenCalled();
  });

  it("Mode A: cycleDashboardScreenBy persists via axios.post (global path)", async () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    // In Pinia setup stores, internal calls go via closure (not the proxy), so spy on
    // axios.post directly — a store.updateConfig spy is vacuous for the same reason as above.
    const spy = vi.spyOn(axios, "post");
    await store.cycleDashboardScreenBy(1);
    expect(spy).toHaveBeenCalled();
  });
});
