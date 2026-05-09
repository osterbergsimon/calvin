/** Tests for calendar store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCalendarStore } from "@/stores/calendar";
import { useConnectionStore } from "@/stores/connection";
import axios from "axios";

// Mock axios
vi.mock("axios");

// Mock connection store
vi.mock("@/stores/connection", () => ({
  useConnectionStore: vi.fn(),
}));

// Mock cache utilities
vi.mock("@/utils/cache", () => ({
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

import { getCachedData, setCachedData } from "@/utils/cache";

describe("Calendar Store", () => {
  let mockConnectionStore;

  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Mock connection store
    mockConnectionStore = {
      isFullyOnline: vi.fn(() => true),
    };
    useConnectionStore.mockReturnValue(mockConnectionStore);
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useCalendarStore();

      expect(store.events).toEqual([]);
      expect(store.sources).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(store.currentDate).toBeInstanceOf(Date);
      expect(store.selectedEvent).toBe(null);
      expect(store.selectedDate).toBe(null);
      expect(store.dayEvents).toEqual([]);
      expect(store.showAllDayEvents).toBe(false);
    });
  });

  describe("fetchSources", () => {
    it("should fetch sources from API", async () => {
      const mockSources = {
        sources: [
          { id: "1", name: "Google Calendar", color: "#4285f4" },
          { id: "2", name: "iCal", color: "#ff5722" },
        ],
      };

      axios.get.mockResolvedValue({ data: mockSources });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useCalendarStore();
      await store.fetchSources();

      expect(axios.get).toHaveBeenCalledWith("/api/calendar/sources");
      expect(store.sources).toEqual(mockSources.sources);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(setCachedData).toHaveBeenCalledWith("calendar_sources", mockSources);
    });

    it("should use cached sources when offline", async () => {
      const mockCachedSources = {
        sources: [{ id: "1", name: "Cached Calendar", color: "#000000" }],
      };

      mockConnectionStore.isFullyOnline.mockReturnValue(false);
      getCachedData.mockReturnValue(mockCachedSources);

      const store = useCalendarStore();
      await store.fetchSources();

      expect(axios.get).not.toHaveBeenCalled();
      expect(store.sources).toEqual(mockCachedSources.sources);
      expect(store.loading).toBe(false);
    });

    it("should fall back to cache when API request fails", async () => {
      const mockCachedSources = {
        sources: [{ id: "1", name: "Cached Calendar", color: "#000000" }],
      };

      axios.get.mockRejectedValue(new Error("Network error"));
      mockConnectionStore.isFullyOnline.mockReturnValue(true);
      getCachedData.mockReturnValue(mockCachedSources);

      const store = useCalendarStore();
      await store.fetchSources();

      expect(store.sources).toEqual(mockCachedSources.sources);
      expect(store.loading).toBe(false);
    });

    it("should handle API errors when no cache available", async () => {
      const error = new Error("Network error");
      axios.get.mockRejectedValue(error);
      mockConnectionStore.isFullyOnline.mockReturnValue(true);
      getCachedData.mockReturnValue(null);

      const store = useCalendarStore();

      await expect(store.fetchSources()).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });
  });

  describe("updateSource", () => {
    it("should update a calendar source", async () => {
      const store = useCalendarStore();
      store.sources = [
        { id: "1", name: "Source 1", color: "#000000" },
        { id: "2", name: "Source 2", color: "#ffffff" },
      ];

      const updatedSource = {
        id: "1",
        name: "Updated Source",
        color: "#ff0000",
      };
      axios.put.mockResolvedValue({ data: updatedSource });

      const result = await store.updateSource("1", { name: "Updated Source" });

      expect(axios.put).toHaveBeenCalledWith("/api/calendar/sources/1", {
        name: "Updated Source",
      });
      expect(store.sources[0]).toEqual(updatedSource);
      expect(result).toEqual(updatedSource);
    });

    it("should handle errors when updating source", async () => {
      const error = new Error("Update failed");
      axios.put.mockRejectedValue(error);

      const store = useCalendarStore();

      await expect(store.updateSource("1", {})).rejects.toThrow("Update failed");
      expect(store.error).toBe("Update failed");
    });
  });

  describe("getSourceColor", () => {
    it("should return source color", () => {
      const store = useCalendarStore();
      store.sources = [
        { id: "1", name: "Source 1", color: "#4285f4" },
        { id: "2", name: "Source 2", color: "#ff5722" },
      ];

      expect(store.getSourceColor("1")).toBe("#4285f4");
      expect(store.getSourceColor("2")).toBe("#ff5722");
    });

    it("should return default color when source not found", () => {
      const store = useCalendarStore();
      store.sources = [];

      expect(store.getSourceColor("999")).toBe("#2196f3");
    });
  });

  describe("shouldShowTime", () => {
    it("should return true when show_time is not false", () => {
      const store = useCalendarStore();
      store.sources = [
        { id: "1", name: "Source 1", show_time: true },
        { id: "2", name: "Source 2", show_time: undefined },
      ];

      expect(store.shouldShowTime("1")).toBe(true);
      expect(store.shouldShowTime("2")).toBe(true);
    });

    it("should return false when show_time is explicitly false", () => {
      const store = useCalendarStore();
      store.sources = [{ id: "1", name: "Source 1", show_time: false }];

      expect(store.shouldShowTime("1")).toBe(false);
    });

    it("should default to true when source not found", () => {
      const store = useCalendarStore();
      store.sources = [];

      expect(store.shouldShowTime("999")).toBe(true);
    });
  });

  describe("fetchEvents", () => {
    it("should fetch events from API", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const mockEvents = {
        events: [
          {
            id: "1",
            title: "Event 1",
            start: "2024-01-15T10:00:00Z",
            end: "2024-01-15T11:00:00Z",
            all_day: false,
          },
        ],
      };

      axios.get.mockResolvedValue({ data: mockEvents });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useCalendarStore();
      await store.fetchEvents(startDate, endDate);

      expect(axios.get).toHaveBeenCalledWith("/api/calendar/events", {
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
      });
      expect(store.events).toEqual(mockEvents.events);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });

    it("should add refresh parameter when provided", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const mockEvents = { events: [] };

      axios.get.mockResolvedValue({ data: mockEvents });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useCalendarStore();
      await store.fetchEvents(startDate, endDate, true);

      expect(axios.get).toHaveBeenCalledWith("/api/calendar/events", {
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          refresh: true,
        },
      });
    });

    it("should add source_ids parameter when source IDs are provided", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const mockEvents = { events: [] };

      axios.get.mockResolvedValue({ data: mockEvents });
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      const store = useCalendarStore();
      await store.fetchEvents(startDate, endDate, false, false, ["family", "personal"]);

      expect(axios.get).toHaveBeenCalledWith("/api/calendar/events", {
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          source_ids: "family,personal",
        },
      });
      expect(store.getEventsForSource(["personal", "family"])).toEqual([]);
    });

    it("should use cached events when offline", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const mockCachedEvents = {
        events: [{ id: "1", title: "Cached Event", start: "2024-01-15T10:00:00Z" }],
      };

      mockConnectionStore.isFullyOnline.mockReturnValue(false);
      getCachedData.mockReturnValue(mockCachedEvents);

      const store = useCalendarStore();
      await store.fetchEvents(startDate, endDate);

      expect(axios.get).not.toHaveBeenCalled();
      expect(store.events).toEqual(mockCachedEvents.events);
      expect(store.loading).toBe(false);
    });

    it("should handle API errors when no cache available", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");
      const error = new Error("Network error");

      axios.get.mockRejectedValue(error);
      mockConnectionStore.isFullyOnline.mockReturnValue(true);
      getCachedData.mockReturnValue(null);

      const store = useCalendarStore();

      await expect(store.fetchEvents(startDate, endDate)).rejects.toThrow("Network error");
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });
  });

  describe("setCurrentDate", () => {
    it("should set current date", () => {
      const store = useCalendarStore();
      const newDate = new Date("2024-02-15");

      store.setCurrentDate(newDate);

      expect(store.currentDate).toEqual(newDate);
    });
  });

  // Note: getCalendarDate, getDateComponents, and compareDateComponents are internal helper methods
  // They are used internally by selectEvent, so we test them indirectly through selectEvent
  // Direct testing is removed as these are not exported

  describe("selectEvent", () => {
    it("should select an event and set selected date", () => {
      const store = useCalendarStore();
      const event = {
        id: "1",
        title: "Test Event",
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
        all_day: false,
      };
      const selectedDay = new Date("2024-01-15");

      store.events = [event];
      store.selectEvent(event, selectedDay);

      expect(store.selectedEvent).toEqual(event);
      expect(store.selectedDate).toBeTruthy();
      expect(store.dayEvents.length).toBeGreaterThan(0);
    });

    it("should find event from main events array", () => {
      const store = useCalendarStore();
      const event1 = {
        id: "1",
        title: "Event 1",
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
        all_day: false,
      };
      const event2 = { ...event1, id: "2", title: "Event 2" };

      store.events = [event1, event2];
      // Pass a different object reference with same ID
      const eventToSelect = { ...event1 };

      store.selectEvent(eventToSelect, new Date("2024-01-15"));

      // Should find and use the event from the main array
      expect(store.selectedEvent.id).toBe("1");
    });

    it("should use event's start date when no selected day provided", () => {
      const store = useCalendarStore();
      const event = {
        id: "1",
        title: "Test Event",
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
        all_day: false,
      };

      store.events = [event];
      store.selectEvent(event);

      expect(store.selectedEvent).toEqual(event);
      expect(store.selectedDate).toBeTruthy();
    });
  });

  describe("setDayEvents", () => {
    it("should set day events", () => {
      const store = useCalendarStore();
      const events = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];

      store.setDayEvents(events);

      expect(store.dayEvents).toEqual(events);
    });
  });

  describe("setShowAllDayEvents", () => {
    it("should set show all day events flag", () => {
      const store = useCalendarStore();

      store.setShowAllDayEvents(true);
      expect(store.showAllDayEvents).toBe(true);

      store.setShowAllDayEvents(false);
      expect(store.showAllDayEvents).toBe(false);
    });
  });

  describe("clearSelectedEvent", () => {
    it("should clear selected event and related state", () => {
      const store = useCalendarStore();
      store.selectedEvent = { id: "1", title: "Event" };
      store.selectedDate = new Date();
      store.dayEvents = [{ id: "1" }];
      store.showAllDayEvents = true;

      store.clearSelectedEvent();

      expect(store.selectedEvent).toBe(null);
      expect(store.selectedDate).toBe(null);
      expect(store.dayEvents).toEqual([]);
      expect(store.showAllDayEvents).toBe(false);
    });
  });
});
