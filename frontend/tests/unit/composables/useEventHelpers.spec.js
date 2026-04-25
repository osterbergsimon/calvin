/**
 * Unit tests for useEventHelpers composable
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEventHelpers } from "@/composables/useEventHelpers";
import { useCalendarStore } from "@/stores/calendar";
import { useConfigStore } from "@/stores/config";

// Mock stores
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: vi.fn(),
}));

vi.mock("@/stores/config", () => ({
  useConfigStore: vi.fn(),
}));

describe("useEventHelpers", () => {
  let mockCalendarStore;
  let mockConfigStore;
  let eventHelpers;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    mockCalendarStore = {
      sources: [],
      shouldShowTime: vi.fn(() => true),
    };

    mockConfigStore = {
      timeFormat: "24h",
    };

    useCalendarStore.mockReturnValue(mockCalendarStore);
    useConfigStore.mockReturnValue(mockConfigStore);

    eventHelpers = useEventHelpers();
  });

  describe("getEventColor", () => {
    it("should return event's own color if present", () => {
      const event = {
        id: "1",
        title: "Event",
        color: "#ff0000",
      };

      const color = eventHelpers.getEventColor(event);

      expect(color).toBe("#ff0000");
    });

    it("should return source color if event has no color", () => {
      mockCalendarStore.sources = [{ id: "source1", name: "Source 1", color: "#00ff00" }];

      const event = {
        id: "1",
        title: "Event",
        source: "source1",
      };

      const color = eventHelpers.getEventColor(event);

      expect(color).toBe("#00ff00");
    });

    it("should return default color when no event color and no source found", () => {
      mockCalendarStore.sources = [];

      const event = {
        id: "1",
        title: "Event",
        source: "nonexistent",
      };

      const color = eventHelpers.getEventColor(event);

      expect(color).toBe("#2196f3");
    });

    it("should return default color when event has no source", () => {
      mockCalendarStore.sources = [];

      const event = {
        id: "1",
        title: "Event",
      };

      const color = eventHelpers.getEventColor(event);

      expect(color).toBe("#2196f3");
    });
  });

  describe("formatEventTime", () => {
    it("should return 'All day' for all-day events", () => {
      const event = {
        id: "1",
        title: "Event",
        all_day: true,
        start: "2024-01-15T00:00:00Z",
        end: "2024-01-15T23:59:59Z",
      };

      const time = eventHelpers.formatEventTime(event);

      expect(time).toBe("All day");
    });

    it("should format time in 24h format", () => {
      mockConfigStore.timeFormat = "24h";

      const event = {
        id: "1",
        title: "Event",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:30:00Z",
      };

      const time = eventHelpers.formatEventTime(event);

      expect(time).toMatch(/^\d{2}:\d{2} - \d{2}:\d{2}$/);
    });

    it("should format time in 12h format", () => {
      mockConfigStore.timeFormat = "12h";

      const event = {
        id: "1",
        title: "Event",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T14:30:00Z",
      };

      const time = eventHelpers.formatEventTime(event);

      expect(time).toMatch(/^\d{1,2}:\d{2} (AM|PM) - \d{1,2}:\d{2} (AM|PM)$/);
    });
  });

  describe("getEventTitle", () => {
    it("should return event title with time", () => {
      mockConfigStore.timeFormat = "24h";

      const event = {
        id: "1",
        title: "Meeting",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
      };

      const title = eventHelpers.getEventTitle(event);

      expect(title).toContain("Meeting");
      expect(title).toContain("(");
      expect(title).toContain(")");
    });
  });

  describe("truncateEventTitle", () => {
    it("should return original title if within max length", () => {
      const title = "Short Event";
      const truncated = eventHelpers.truncateEventTitle(title, 50);

      expect(truncated).toBe("Short Event");
    });

    it("should truncate long titles", () => {
      const title = "This is a very long event title that exceeds the maximum length";
      const truncated = eventHelpers.truncateEventTitle(title, 30);

      expect(truncated.length).toBe(30);
      expect(truncated.endsWith("...")).toBe(true);
      expect(truncated).toContain("This is a very long ev");
    });

    it("should handle empty title", () => {
      const truncated = eventHelpers.truncateEventTitle("", 50);

      expect(truncated).toBe("");
    });

    it("should handle null title", () => {
      const truncated = eventHelpers.truncateEventTitle(null, 50);

      expect(truncated).toBe("");
    });
  });

  describe("getEventDisplayText", () => {
    it("should show time when shouldShowTime returns true", () => {
      mockConfigStore.timeFormat = "24h";
      mockCalendarStore.shouldShowTime.mockReturnValue(true);

      const event = {
        id: "1",
        title: "Meeting",
        source: "source1",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
      };

      const displayText = eventHelpers.getEventDisplayText(event);

      expect(displayText).toContain("Meeting");
      expect(displayText).toMatch(/^\d{2}:\d{2}/);
      expect(mockCalendarStore.shouldShowTime).toHaveBeenCalledWith("source1");
    });

    it("should not show time when shouldShowTime returns false", () => {
      mockCalendarStore.shouldShowTime.mockReturnValue(false);

      const event = {
        id: "1",
        title: "Meeting",
        source: "source1",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
      };

      const displayText = eventHelpers.getEventDisplayText(event);

      expect(displayText).toBe("Meeting");
    });

    it("should not show time for all-day events", () => {
      mockCalendarStore.shouldShowTime.mockReturnValue(true);

      const event = {
        id: "1",
        title: "Meeting",
        source: "source1",
        all_day: true,
        start: "2024-01-15T00:00:00Z",
        end: "2024-01-15T23:59:59Z",
      };

      const displayText = eventHelpers.getEventDisplayText(event);

      expect(displayText).toBe("Meeting");
    });

    it("should show time for events without valid source ID", () => {
      mockConfigStore.timeFormat = "24h";

      const event = {
        id: "1",
        title: "Meeting",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
      };

      const displayText = eventHelpers.getEventDisplayText(event);

      expect(displayText).toContain("Meeting");
      expect(displayText).toMatch(/^\d{2}:\d{2}/);
    });

    it("should not check shouldShowTime for invalid source IDs", () => {
      const event = {
        id: "1",
        title: "Meeting",
        source: "google",
        all_day: false,
        start: "2024-01-15T10:00:00Z",
        end: "2024-01-15T11:00:00Z",
      };

      eventHelpers.getEventDisplayText(event);

      expect(mockCalendarStore.shouldShowTime).not.toHaveBeenCalled();
    });
  });
});
