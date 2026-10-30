/** Tests for config store. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe("Config Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    api.post.mockResolvedValue({ data: {} });
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

    api.get.mockResolvedValue({ data: mockConfig });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(api.get).toHaveBeenCalledWith("/config");
    expect(store.orientation).toBe("portrait");
    expect(store.calendarSplit).toBe(75);
    expect(store.showUI).toBe(false);
  });

  it("should hydrate snake_case aliases and parse JSON schedule values", async () => {
    const schedule = [{ day: 0, enabled: false, onTime: "07:30", offTime: "21:00" }];
    api.get.mockResolvedValue({
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

  it("hydrates the on-screen keyboard layout keys and drops invalid values", async () => {
    api.get.mockResolvedValue({
      data: {
        oskLayout: "sv",
        oskExtraLayouts: ["en", "xx", "fi"],
      },
    });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.oskLayout).toBe("sv");
    expect(store.oskExtraLayouts).toEqual(["en", "fi"]);
  });

  it("leaves the keyboard layout unset when the config has no answer", async () => {
    api.get.mockResolvedValue({ data: { oskLayout: "xx" } });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.oskLayout).toBeNull();
    expect(store.oskExtraLayouts).toEqual([]);
  });

  it("should normalize dashboard layout and screens through the config registry", async () => {
    api.get.mockResolvedValue({
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

  it("migrates the old household display settings into regions once (CLV-49)", async () => {
    const oldScreens = {
      version: 2,
      activeScreenId: "home",
      screens: [
        {
          id: "home",
          name: "Home",
          activeRegionId: "cal",
          layout: {
            regions: [
              { id: "cal", kind: "calendar", size: 50, instanceIds: [] },
              { id: "photos", kind: "photos", size: 50, instanceIds: [] },
            ],
          },
        },
      ],
    };
    api.get.mockResolvedValueOnce({
      data: {
        showWeekNumbers: true,
        maxVisibleEvents: 6,
        imageDisplayMode: "crop",
        dashboardScreens: oldScreens,
      },
    });
    api.post.mockResolvedValue({ data: {} });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.dashboardScreens.screens[0].layout.regions[0].view).toMatchObject({
      weekNumbers: true,
      maxVisibleEvents: 6,
    });
    expect(store.dashboardScreens.screens[0].layout.regions[1].view).toEqual({ fit: "fill" });
    expect(api.post).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({ displaySettingsMigrated: true })
    );

    // The second load sees the flag: no migration, no second write.
    api.get.mockResolvedValueOnce({
      data: {
        displaySettingsMigrated: true,
        dashboardScreens: JSON.parse(JSON.stringify(store.dashboardScreens)),
      },
    });
    await store.fetchConfig();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("leaves regions with their own display values untouched during migration", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        showWeekNumbers: true,
        maxVisibleEvents: 6,
        imageDisplayMode: "fit",
        dashboardScreens: {
          version: 2,
          activeScreenId: "home",
          screens: [
            {
              id: "home",
              name: "Home",
              activeRegionId: "cal",
              layout: {
                regions: [
                  {
                    id: "cal",
                    kind: "calendar",
                    size: 50,
                    view: { mode: "month", weekNumbers: false, maxVisibleEvents: 2 },
                  },
                  { id: "photos", kind: "photos", size: 50, view: { fit: "center" } },
                ],
              },
            },
          ],
        },
      },
    });
    api.post.mockResolvedValue({ data: {} });

    const store = useConfigStore();
    await store.fetchConfig();

    const [cal, photos] = store.dashboardScreens.screens[0].layout.regions;
    expect(cal.view.weekNumbers).toBe(false);
    expect(cal.view.maxVisibleEvents).toBe(2);
    expect(photos.view.fit).toBe("center");
  });

  it("should apply defaults for missing values after fetch", async () => {
    api.get.mockResolvedValue({ data: { orientation: "portrait" } });

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

    api.post.mockResolvedValue({ data: mockResponse });

    const store = useConfigStore();
    await store.updateConfig(updateData);

    expect(api.post).toHaveBeenCalledWith("/config", updateData);
    expect(store.orientation).toBe("landscape");
    expect(store.calendarSplit).toBe(72);
  });

  it("should update all registered config fields from camelCase or snake_case payloads", async () => {
    api.post.mockResolvedValue({ data: { show_ui: true, clock_bar_padding: 12 } });

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
    api.get.mockRejectedValue(error);

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

const REGION_SCREENS = {
  version: 2,
  activeScreenId: "a",
  screens: [
    {
      id: "a",
      name: "A",
      activeRegionId: "a1",
      layout: {
        regions: [
          { id: "a1", kind: "calendar", instanceIds: [], size: 50 },
          { id: "a2", kind: "photos", instanceIds: [], size: 50 },
        ],
      },
    },
    {
      id: "b",
      name: "B",
      activeRegionId: "b1",
      layout: {
        regions: [
          { id: "b1", kind: "calendar", instanceIds: [], size: 50 },
          { id: "b2", kind: "photos", instanceIds: [], size: 50 },
        ],
      },
    },
  ],
};

describe("config store — region writes target the effective screen (dd9.8)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: {} });
  });

  it("kiosk mode: cycleActiveDashboardRegionBy cycles the kiosk-active screen, not global", async () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = REGION_SCREENS;
    store.availableScreens = null;
    store.kioskActiveScreenId = "b"; // global active is "a"
    await store.cycleActiveDashboardRegionBy(1);
    expect(store.dashboardScreens.screens.find(s => s.id === "b").activeRegionId).toBe("b2");
    expect(store.dashboardScreens.screens.find(s => s.id === "a").activeRegionId).toBe("a1");
    expect(store.dashboardScreens.activeScreenId).toBe("a"); // global active unchanged
  });

  it("kiosk mode: updateRegionView patches the kiosk-active screen's region", async () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = REGION_SCREENS;
    store.availableScreens = null;
    store.kioskActiveScreenId = "b";
    await store.updateRegionView("b1", { weeks: 3 });
    const bCal = store.dashboardScreens.screens
      .find(s => s.id === "b")
      .layout.regions.find(r => r.id === "b1");
    expect(bCal.view.weeks).toBe(3);
    const aCal = store.dashboardScreens.screens
      .find(s => s.id === "a")
      .layout.regions.find(r => r.id === "a1");
    expect(aCal.view.weeks).toBe(4); // untouched: default, not the patch
  });

  it("Mode A: cycleActiveDashboardRegionBy still cycles the global active screen", async () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = REGION_SCREENS; // active "a"
    await store.cycleActiveDashboardRegionBy(1);
    expect(store.dashboardScreens.screens.find(s => s.id === "a").activeRegionId).toBe("a2");
    expect(store.dashboardScreens.screens.find(s => s.id === "b").activeRegionId).toBe("b1");
  });
});

describe("config store — switch actions branch on kiosk mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Reset call counts then set up resolved value so Mode A tests don't throw.
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: {} });
  });

  it("kiosk mode: activate updates local id, no updateConfig network call", async () => {
    setSearch("?kiosk=k1");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    store.kioskActiveScreenId = "a";
    await store.activateDashboardScreen("c");
    expect(store.kioskActiveScreenId).toBe("c");
    // Spy on real network layer — vacuous store-proxy spy replaced with genuine guard.
    expect(api.post).not.toHaveBeenCalled();
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
    expect(api.post).not.toHaveBeenCalled();
  });

  it("Mode A: activate still persists via updateConfig (regression)", async () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    // Note: in Pinia setup stores, internal calls go via closure (not the proxy),
    // so we spy on api.post instead of store.updateConfig to verify persistence.
    const spy = vi.spyOn(api, "post");
    await store.activateDashboardScreen("c");
    expect(spy).toHaveBeenCalled();
  });

  it("Mode A: cycleDashboardScreenBy persists via api.post (global path)", async () => {
    setSearch("");
    const store = useConfigStore();
    store.dashboardScreens = SCREENS;
    // In Pinia setup stores, internal calls go via closure (not the proxy), so spy on
    // api.post directly — a store.updateConfig spy is vacuous for the same reason as above.
    const spy = vi.spyOn(api, "post");
    await store.cycleDashboardScreenBy(1);
    expect(spy).toHaveBeenCalled();
  });
});

describe("config store — offline cache (audit R7)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("serves the cached config, flagged stale, when the backend is unreachable at boot", async () => {
    api.get.mockResolvedValueOnce({ data: { orientation: "portrait", calendarSplit: 60 } });
    await useConfigStore().fetchConfig();

    // A reload while the backend is down, long after the cache's TTL.
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);
    api.get.mockRejectedValueOnce(new Error("Network Error"));
    const store = useConfigStore();
    await store.fetchConfig();
    vi.useRealTimers();

    expect(store.orientation).toBe("portrait");
    expect(store.calendarSplit).toBe(60);
    expect(store.stale).toBe(true);
    expect(store.error).toBe(null);
  });

  it("keeps the live config when a later poll fails", async () => {
    api.get.mockResolvedValueOnce({ data: { orientation: "portrait" } });
    const store = useConfigStore();
    await store.fetchConfig();
    await store.updateConfig({ orientation: "landscape" });

    api.get.mockRejectedValueOnce(new Error("Network Error"));
    await store.fetchConfig();

    // The cached copy is older than the in-memory change: it must not win.
    expect(store.orientation).toBe("landscape");
    expect(store.stale).toBe(false);
    expect(store.error).toBe("Network Error");
  });

  it("reports the error when there is nothing cached", async () => {
    api.get.mockRejectedValueOnce(new Error("Network Error"));
    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.error).toBe("Network Error");
    expect(store.stale).toBe(false);
  });
});

describe("Config Store kiosk viewport reporting (CLV-36)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    api.get.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("adds vw/vh to a kiosk's config fetch", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "kitchen-3f9a2c");
    const store = useConfigStore();
    await store.fetchConfig();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toContain("/kiosks/kitchen-3f9a2c/config?");
    expect(api.get.mock.calls[0][0]).toMatch(/vw=\d+&vh=\d+$/);
  });

  it("does not report from a plain browser", async () => {
    const store = useConfigStore();
    await store.fetchConfig();

    expect(api.get).toHaveBeenCalledWith("/config");
  });

  it("re-fetches once, debounced 2s, after a resize", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("calvin_kiosk_id", "kitchen-3f9a2c");
    const store = useConfigStore();
    await store.fetchConfig();
    expect(api.get).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(api.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
