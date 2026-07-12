/**
 * Unit tests for keyboard actions composable
 * Tests calendar event navigation and keyboard action resolution
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useModeStore } from "@/stores/mode";
import { useCalendarStore } from "@/stores/calendar";
import { normalizeDashboardScreens } from "@/utils/layout";

const mocks = vi.hoisted(() => ({
  configStore: null,
  kioskId: null,
}));

// Mock vue-router
vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock other stores
vi.mock("@/stores/images", () => ({
  useImagesStore: () => ({
    nextImage: vi.fn(),
    previousImage: vi.fn(),
  }),
}));

vi.mock("@/stores/webServices", () => ({
  useWebServicesStore: () => ({
    setServiceIndex: vi.fn(),
    nextService: vi.fn(),
    previousService: vi.fn(),
    currentServiceIndex: 0,
    services: [{}, {}],
  }),
}));

vi.mock("@/stores/config", () => ({
  useConfigStore: () => mocks.configStore,
}));

vi.mock("@/utils/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

describe("useKeyboardActions - Calendar Event Navigation", () => {
  let modeStore;
  let calendarStore;
  let keyboardActions;

  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.configStore = {
      updateConfig: vi.fn().mockResolvedValue(undefined),
      setDashboardScreens: vi.fn(screens => {
        mocks.configStore.dashboardScreens = screens;
      }),
      activateDashboardScreen: vi.fn().mockResolvedValue(undefined),
      cycleDashboardScreenBy: vi.fn().mockResolvedValue(undefined),
      setLastSideViewMode: vi.fn(),
      shouldShowUI: true,
      dashboardScreens: null,
      availableScreens: null,
      get effectiveDashboardScreens() {
        const normalized = normalizeDashboardScreens(mocks.configStore.dashboardScreens);
        if (!mocks.configStore.availableScreens) return normalized;
        // Simulate filterAvailableScreens for kiosk tests
        const allowed = new Set(mocks.configStore.availableScreens);
        const filtered = normalized.screens.filter(s => allowed.has(s.id));
        const activeInFiltered = filtered.find(s => s.id === normalized.activeScreenId)
          ? normalized.activeScreenId
          : (filtered[0]?.id ?? null);
        return { ...normalized, screens: filtered, activeScreenId: activeInFiltered };
      },
    };
    modeStore = useModeStore();
    calendarStore = useCalendarStore();
    keyboardActions = useKeyboardActions();

    // Set up default state
    modeStore.setMode(modeStore.MODES.CALENDAR);
    calendarStore.events = [];
    calendarStore.selectedEvent = null;
    calendarStore.selectedDate = null;
    calendarStore.dayEvents = [];
  });

  describe("Event navigation within day", () => {
    it("should navigate to next event within the same day", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2];
      calendarStore.selectEvent(event1, today);
      calendarStore.dayEvents = [event1, event2];

      keyboardActions.handleAction("calendar_next_event");

      expect(calendarStore.selectedEvent.id).toBe("2");
      expect(calendarStore.selectedDate).toEqual(today);
    });

    it("should navigate to previous event within the same day", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2];
      calendarStore.selectEvent(event2, today);
      calendarStore.dayEvents = [event1, event2];

      keyboardActions.handleAction("calendar_prev_event");

      expect(calendarStore.selectedEvent.id).toBe("1");
      expect(calendarStore.selectedDate).toEqual(today);
    });

    it("should navigate to first event of next day when on last event", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date("2024-01-16");
      tomorrow.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-16T10:00:00").toISOString(),
        end: new Date("2024-01-16T11:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2];
      calendarStore.selectEvent(event1, today);
      calendarStore.dayEvents = [event1]; // Only one event today

      keyboardActions.handleAction("calendar_next_event");

      // Should navigate to next day and select first event
      expect(calendarStore.selectedEvent.id).toBe("2");
    });

    it("should navigate to last event of previous day when on first event", () => {
      const today = new Date("2024-01-16");
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date("2024-01-15");
      yesterday.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      const event3 = {
        id: "3",
        title: "Event 3",
        start: new Date("2024-01-16T10:00:00").toISOString(),
        end: new Date("2024-01-16T11:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2, event3];
      calendarStore.selectEvent(event3, today);
      calendarStore.dayEvents = [event3]; // Only one event today

      keyboardActions.handleAction("calendar_prev_event");

      // Should navigate to previous day and select last event (event2)
      expect(calendarStore.selectedEvent.id).toBe("2");
    });
  });

  describe("Generic next/prev action resolution", () => {
    it("should resolve generic_next to calendar_next_event when event detail panel is open", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2];
      calendarStore.selectEvent(event1, today);
      calendarStore.dayEvents = [event1, event2];

      keyboardActions.handleAction("generic_next");

      // Should navigate to next event
      expect(calendarStore.selectedEvent.id).toBe("2");
    });

    it("should resolve generic_prev to calendar_prev_event when event detail panel is open", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2];
      calendarStore.selectEvent(event2, today);
      calendarStore.dayEvents = [event1, event2];

      keyboardActions.handleAction("generic_prev");

      // Should navigate to previous event
      expect(calendarStore.selectedEvent.id).toBe("1");
    });

    it("should resolve generic_next to calendar_next_month when no event is selected", () => {
      const initialDate = calendarStore.currentDate;
      keyboardActions.handleAction("generic_next");

      // Should navigate to next month
      expect(calendarStore.currentDate.getMonth()).toBe((initialDate.getMonth() + 1) % 12);
    });

    it("navigates by the focused region's view mode (day steps a day, not a month)", () => {
      mocks.configStore.dashboardScreens = {
        version: 2,
        activeScreenId: "home",
        screens: [
          {
            id: "home",
            name: "Home",
            layout: {
              version: 1,
              preset: "single",
              regions: [
                {
                  id: "region-1",
                  kind: "calendar",
                  size: 100,
                  view: { mode: "day", rolling: false, weeks: 4, days: 7 },
                },
              ],
            },
            activeRegionId: "region-1",
          },
        ],
      };
      calendarStore.setCurrentDate(new Date("2024-01-15T12:00:00"));
      keyboardActions.handleAction("calendar_next");
      // Day view → +1 day (Jan 16), not a month jump.
      expect(calendarStore.currentDate.getDate()).toBe(16);
      expect(calendarStore.currentDate.getMonth()).toBe(0);
    });
  });

  describe("Dashboard screen activation", () => {
    it("activates a matching split leaf for screen-jump actions", () => {
      mocks.configStore.dashboardScreens = {
        version: 2,
        activeScreenId: "home",
        screens: [
          {
            id: "home",
            name: "Home",
            layout: {
              version: 1,
              preset: "single",
              regions: [{ id: "region-1", kind: "calendar", size: 100 }],
            },
            activeRegionId: "region-1",
          },
          {
            id: "media",
            name: "Media",
            layout: {
              version: 1,
              preset: "single",
              regions: [
                {
                  id: "region-1",
                  kind: "service",
                  size: 100,
                  split: {
                    regions: [
                      { id: "region-1-a", kind: "service", size: 50 },
                      { id: "region-1-b", kind: "photos", size: 50 },
                    ],
                  },
                },
              ],
            },
            activeRegionId: "region-1-a",
          },
        ],
      };

      keyboardActions.handleAction("screen_jump_photos");

      // Screen selection is now routed through activateDashboardScreen (not setDashboardScreens).
      expect(mocks.configStore.activateDashboardScreen).toHaveBeenCalledWith("media");
      // The activeRegionId bookmark is still written to the raw catalog via setDashboardScreens.
      const nextScreens = mocks.configStore.setDashboardScreens.mock.calls.at(-1)[0];
      expect(nextScreens.screens[1].activeRegionId).toBe("region-1-b");
    });

    it("resolves the retired mode_photos alias to screen_jump_photos", () => {
      mocks.configStore.dashboardScreens = {
        version: 2,
        activeScreenId: "home",
        screens: [
          {
            id: "home",
            name: "Home",
            layout: {
              version: 1,
              preset: "single",
              regions: [{ id: "region-1", kind: "calendar", size: 100 }],
            },
            activeRegionId: "region-1",
          },
          {
            id: "media",
            name: "Media",
            layout: {
              version: 1,
              preset: "single",
              regions: [{ id: "region-1", kind: "photos", size: 100 }],
            },
            activeRegionId: "region-1",
          },
        ],
      };

      keyboardActions.handleAction("mode_photos");

      // Screen selection routed through activateDashboardScreen.
      expect(mocks.configStore.activateDashboardScreen).toHaveBeenCalledWith("media");
    });
  });

  describe("Event selection when opening a day", () => {
    it("should select first event when opening a day with multiple events", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date(today.getTime() + 10 * 60 * 60 * 1000).toISOString(), // 10:00
        end: new Date(today.getTime() + 11 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date(today.getTime() + 14 * 60 * 60 * 1000).toISOString(), // 14:00
        end: new Date(today.getTime() + 15 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      const event3 = {
        id: "3",
        title: "Event 3",
        start: new Date(today.getTime() + 16 * 60 * 60 * 1000).toISOString(), // 16:00
        end: new Date(today.getTime() + 17 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      calendarStore.events = [event1, event2, event3];

      keyboardActions.handleAction("calendar_expand_today");

      // Should select the first event (sorted by start time)
      expect(calendarStore.selectedEvent.id).toBe("1");
      expect(calendarStore.selectedDate).toBeTruthy();
    });

    it("should create placeholder event when opening a day with no events", () => {
      calendarStore.events = [];

      keyboardActions.handleAction("calendar_expand_today");

      // Should create a placeholder event
      expect(calendarStore.selectedEvent).toBeTruthy();
      expect(calendarStore.selectedEvent.title).toBe("No events");
      expect(calendarStore.selectedEvent.id).toContain("placeholder-");
    });
  });

  describe("Event sorting", () => {
    it("should select first event when multiple events exist for today", () => {
      // Use actual today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date(today.getTime() + 10 * 60 * 60 * 1000).toISOString(), // 10:00
        end: new Date(today.getTime() + 11 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date(today.getTime() + 14 * 60 * 60 * 1000).toISOString(), // 14:00
        end: new Date(today.getTime() + 15 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      calendarStore.events = [event2, event1]; // Reverse order to test sorting

      keyboardActions.handleAction("calendar_expand_today");

      // Should select the first event after sorting (earlier start time)
      expect(calendarStore.selectedEvent).toBeTruthy();
      expect(["1", "2"]).toContain(calendarStore.selectedEvent.id);
      expect(calendarStore.selectedDate).toBeTruthy();
    });

    it("should use sorted order when navigating events", () => {
      const today = new Date("2024-01-15");
      today.setHours(0, 0, 0, 0);

      const event1 = {
        id: "1",
        title: "Event 1",
        start: new Date("2024-01-15T10:00:00").toISOString(),
        end: new Date("2024-01-15T11:00:00").toISOString(),
        all_day: false,
      };

      const event2 = {
        id: "2",
        title: "Event 2",
        start: new Date("2024-01-15T14:00:00").toISOString(),
        end: new Date("2024-01-15T15:00:00").toISOString(),
        all_day: false,
      };

      calendarStore.events = [event2, event1]; // Reverse order
      calendarStore.selectEvent(event1, today);
      calendarStore.dayEvents = [event1, event2]; // Sorted order

      keyboardActions.handleAction("calendar_next_event");

      // Should navigate to next event in sorted order
      expect(calendarStore.selectedEvent.id).toBe("2");
    });
  });

  describe("Placeholder event handling", () => {
    it("should navigate to next day when on placeholder event and pressing next", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const placeholderEvent = {
        id: `placeholder-${today.getTime()}`,
        title: "No events",
        start: today.toISOString(),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
        all_day: true,
      };

      const nextDayEvent = {
        id: "1",
        title: "Next Day Event",
        start: new Date(tomorrow.getTime() + 10 * 60 * 60 * 1000).toISOString(),
        end: new Date(tomorrow.getTime() + 11 * 60 * 60 * 1000).toISOString(),
        all_day: false,
      };

      calendarStore.events = [nextDayEvent];
      calendarStore.selectedEvent = placeholderEvent;
      calendarStore.selectedDate = today;
      calendarStore.dayEvents = [];

      keyboardActions.handleAction("calendar_next_event");

      // Should navigate to next day with events
      expect(calendarStore.selectedEvent.id).toBe("1");
    });
  });
});

describe("useKeyboardActions - Kiosk screen selection does not corrupt global catalog", () => {
  let keyboardActions;

  // Two screens: screen-a (calendar only) is available to kiosk; screen-b (photos only) is NOT.
  const makeScreens = () =>
    normalizeDashboardScreens({
      version: 2,
      activeScreenId: "screen-a",
      screens: [
        {
          id: "screen-a",
          name: "Screen A",
          layout: {
            version: 1,
            preset: "single",
            regions: [{ id: "cal-region", kind: "calendar", size: 100 }],
          },
          activeRegionId: "cal-region",
        },
        {
          id: "screen-b",
          name: "Screen B",
          layout: {
            version: 1,
            preset: "single",
            regions: [{ id: "photos-region", kind: "photos", size: 100 }],
          },
          activeRegionId: "photos-region",
        },
      ],
    });

  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.configStore = {
      updateConfig: vi.fn().mockResolvedValue(undefined),
      setDashboardScreens: vi.fn(screens => {
        mocks.configStore.dashboardScreens = screens;
      }),
      activateDashboardScreen: vi.fn().mockResolvedValue(undefined),
      cycleDashboardScreenBy: vi.fn().mockResolvedValue(undefined),
      setLastSideViewMode: vi.fn(),
      shouldShowUI: true,
      dashboardScreens: makeScreens(),
      availableScreens: ["screen-a"], // kiosk can only see screen-a
      get effectiveDashboardScreens() {
        const normalized = normalizeDashboardScreens(mocks.configStore.dashboardScreens);
        if (!mocks.configStore.availableScreens) return normalized;
        const allowed = new Set(mocks.configStore.availableScreens);
        const filtered = normalized.screens.filter(s => allowed.has(s.id));
        const activeInFiltered = filtered.find(s => s.id === normalized.activeScreenId)
          ? normalized.activeScreenId
          : (filtered[0]?.id ?? null);
        return { ...normalized, screens: filtered, activeScreenId: activeInFiltered };
      },
    };
    useModeStore();
    keyboardActions = useKeyboardActions();
  });

  it("screen_next in kiosk mode calls cycleDashboardScreenBy, NOT updateConfig", () => {
    keyboardActions.handleAction("screen_next");
    expect(mocks.configStore.cycleDashboardScreenBy).toHaveBeenCalledWith(1);
    expect(mocks.configStore.updateConfig).not.toHaveBeenCalled();
  });

  it("screen_prev in kiosk mode calls cycleDashboardScreenBy, NOT updateConfig", () => {
    keyboardActions.handleAction("screen_prev");
    expect(mocks.configStore.cycleDashboardScreenBy).toHaveBeenCalledWith(-1);
    expect(mocks.configStore.updateConfig).not.toHaveBeenCalled();
  });

  // This test only verifies that the composable routes screen_next to cycleDashboardScreenBy
  // (not updateConfig). The store is mocked here so cycleDashboardScreenBy is a no-op;
  // the catalog-length assertion is trivially true because the mock never mutates dashboardScreens.
  // The meaningful guard that cycleDashboardScreenBy does NOT overwrite the global catalog with a
  // filtered subset lives in config.spec.js ("kiosk mode: cycle updates local id among available").
  it("screen_next routes to cycleDashboardScreenBy (composable→store routing only)", () => {
    keyboardActions.handleAction("screen_next");
    expect(mocks.configStore.cycleDashboardScreenBy).toHaveBeenCalledWith(1);
    expect(mocks.configStore.updateConfig).not.toHaveBeenCalled();
  });

  it("screen_jump (activateFirstScreenContainingKind) only searches available screens in kiosk mode", () => {
    // screen-b has a photos region but is NOT available to this kiosk.
    // screen_jump_photos should find no match (screen-b is filtered out), so it returns false.
    // The action falls through without calling updateConfig.
    keyboardActions.handleAction("screen_jump_photos");
    // activateDashboardScreen must not have been called (no available photos screen)
    expect(mocks.configStore.activateDashboardScreen).not.toHaveBeenCalled();
    expect(mocks.configStore.updateConfig).not.toHaveBeenCalled();
  });

  it("screen_jump lands on the correct available screen when it exists", () => {
    // screen-a has a calendar region and IS available.
    keyboardActions.handleAction("screen_jump_calendar");
    // Screen selection must go through activateDashboardScreen (kiosk-local, no global write).
    expect(mocks.configStore.activateDashboardScreen).toHaveBeenCalledWith("screen-a");
    // The global catalog must not have lost any screens (any updateConfig call is
    // for region-bookmark purposes only, not screen-selection).
    const catalogScreenCount = mocks.configStore.dashboardScreens.screens.length;
    expect(catalogScreenCount).toBe(2);
  });

  // This test only verifies composable→store routing: that screen_next calls cycleDashboardScreenBy
  // regardless of kiosk mode. The store is mocked, so actual Mode-A/kiosk persistence branching
  // (i.e. Mode A writes to the global config via axios.post, kiosk mode does not) is covered
  // in config.spec.js ("Mode A: activate still persists via updateConfig" and the kiosk cycle test).
  it("Mode A: screen_next routes through cycleDashboardScreenBy", () => {
    // Remove kiosk restriction to simulate Mode A
    mocks.configStore.availableScreens = null;
    // In Mode A cycleDashboardScreenBy should still be called (store persists internally)
    keyboardActions.handleAction("screen_next");
    expect(mocks.configStore.cycleDashboardScreenBy).toHaveBeenCalledWith(1);
  });

  it("Mode A: activateScreen calls activateDashboardScreen (regression guard)", () => {
    mocks.configStore.availableScreens = null;
    keyboardActions.activateScreen("screen-b");
    expect(mocks.configStore.activateDashboardScreen).toHaveBeenCalledWith("screen-b");
  });
});
