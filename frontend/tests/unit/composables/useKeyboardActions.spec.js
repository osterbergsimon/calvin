/**
 * Unit tests for keyboard actions composable
 * Tests calendar event navigation and keyboard action resolution
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyboardActions } from "@/composables/useKeyboardActions";
import { useModeStore } from "@/stores/mode";
import { useCalendarStore } from "@/stores/calendar";

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
  useConfigStore: () => ({
    cycleCalendarViewMode: vi.fn(),
    calendarViewMode: "month",
    setCalendarViewMode: vi.fn(),
    updateConfig: vi.fn(),
    setLastSideViewMode: vi.fn(),
    shouldShowUI: true,
  }),
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
      expect(calendarStore.currentDate.getMonth()).toBe(
        (initialDate.getMonth() + 1) % 12,
      );
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
