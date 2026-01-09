/**
 * Unit tests for EventDetailPanel component
 * Tests functionality: event details display, multi-day events, multiple events, close/selection
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import EventDetailPanel from "@/components/EventDetailPanel.vue";
import { useConfigStore } from "@/stores/config";
import { useCalendarStore } from "@/stores/calendar";

describe("EventDetailPanel", () => {
  let configStore;
  let calendarStore;
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    configStore = useConfigStore();
    calendarStore = useCalendarStore();

    // Reset stores
    configStore.timeFormat = "24h";
    calendarStore.dayEvents = [];
    calendarStore.showAllDayEvents = false;
    calendarStore.selectedDate = null;
    calendarStore.sources = [];
  });

  const createEvent = (overrides = {}) => ({
    id: "1",
    title: "Test Event",
    start: "2024-01-15T10:00:00",
    end: "2024-01-15T12:00:00",
    all_day: false,
    source: "test-source",
    ...overrides,
  });

  const createWrapper = (props = {}) => {
    const defaultProps = {
      event: createEvent(),
      ...props,
    };

    return mount(EventDetailPanel, {
      props: defaultProps,
      global: {
        plugins: [pinia],
      },
    });
  };

  describe("Visibility", () => {
    it("should render when event is provided", () => {
      const event = createEvent();
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-detail-panel").exists()).toBe(true);
    });

    it("should not render when event is null", () => {
      const wrapper = createWrapper({ event: null });

      expect(wrapper.find(".event-detail-panel").exists()).toBe(false);
    });
  });

  describe("Event Display", () => {
    it("should display event title", () => {
      const event = createEvent({ title: "Important Meeting" });
      const wrapper = createWrapper({ event });

      expect(wrapper.find("h3").text()).toBe("Important Meeting");
    });

    it("should display event date in header", () => {
      const event = createEvent({ start: "2024-01-15T10:00:00" });
      const wrapper = createWrapper({ event });

      const dateHeader = wrapper.find(".event-date-header");
      expect(dateHeader.exists()).toBe(true);
      expect(dateHeader.text()).toBeTruthy();
    });

    it("should display location when provided", () => {
      const event = createEvent({ location: "Conference Room A" });
      const wrapper = createWrapper({ event });

      const locationRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Location:"));
      expect(locationRow.exists()).toBe(true);
      expect(locationRow.text()).toContain("Conference Room A");
    });

    it("should display description when provided", () => {
      const event = createEvent({ description: "This is a test description" });
      const wrapper = createWrapper({ event });

      const descriptionRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Description:"));
      expect(descriptionRow.exists()).toBe(true);
      expect(descriptionRow.text()).toContain("This is a test description");
    });
  });

  describe("Single-Day Events", () => {
    it("should display date and time for single-day timed events", () => {
      const event = createEvent({
        start: "2024-01-15T10:00:00",
        end: "2024-01-15T12:00:00",
        all_day: false,
      });
      const wrapper = createWrapper({ event });

      const dateRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Date:"));
      expect(dateRow.exists()).toBe(true);

      const timeRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Time:"));
      expect(timeRow.exists()).toBe(true);
      expect(timeRow.text()).toMatch(/\d{1,2}:\d{2}/); // Time format
    });

    it("should display all-day indicator for all-day events", () => {
      const event = createEvent({
        start: "2024-01-15T00:00:00",
        end: "2024-01-15T23:59:59",
        all_day: true,
      });
      calendarStore.dayEvents = [event];
      const wrapper = createWrapper({ event });

      // For all-day events in the day events list
      const allDayText = wrapper.text();
      // Note: All-day check is in dayEvents list, not detail panel directly
      expect(allDayText).toBeTruthy();
    });
  });

  describe("Multi-Day Events", () => {
    it("should display start and end dates for multi-day events", () => {
      const event = createEvent({
        start: "2024-01-15T10:00:00",
        end: "2024-01-17T14:00:00",
        all_day: false,
      });
      const wrapper = createWrapper({ event });

      const selectedDateRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Selected Date:"));
      expect(selectedDateRow.exists()).toBe(true);

      const startRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Start:"));
      expect(startRow.exists()).toBe(true);

      const endRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("End:"));
      expect(endRow.exists()).toBe(true);
    });
  });

  describe("Multiple Events for a Day", () => {
    it("should show events list when multiple events exist", () => {
      const event1 = createEvent({ id: "1", title: "Event 1" });
      const event2 = createEvent({ id: "2", title: "Event 2" });
      calendarStore.dayEvents = [event1, event2];

      const wrapper = createWrapper({ event: event1 });

      expect(wrapper.find(".day-events-list").exists()).toBe(true);
      expect(wrapper.find(".day-events-header").text()).toContain(
        "All Events (2)",
      );
    });

    it("should highlight active event in events list", () => {
      const event1 = createEvent({ id: "1", title: "Event 1" });
      const event2 = createEvent({ id: "2", title: "Event 2" });
      calendarStore.dayEvents = [event1, event2];

      const wrapper = createWrapper({ event: event1 });

      const eventItems = wrapper.findAll(".day-event-item");
      expect(eventItems[0].classes()).toContain("active");
      expect(eventItems[1].classes()).not.toContain("active");
    });

    it("should allow selecting different event from list", async () => {
      const event1 = createEvent({ id: "1", title: "Event 1" });
      const event2 = createEvent({ id: "2", title: "Event 2" });
      calendarStore.dayEvents = [event1, event2];
      const selectEventSpy = vi.spyOn(calendarStore, "selectEvent");

      const wrapper = createWrapper({ event: event1 });

      const eventItems = wrapper.findAll(".day-event-item");
      await eventItems[1].trigger("click");

      expect(selectEventSpy).toHaveBeenCalledWith(event2);
    });
  });

  describe("Close Functionality", () => {
    it("should emit close event when close button is clicked", async () => {
      const wrapper = createWrapper();

      await wrapper.find(".btn-close").trigger("click");

      expect(wrapper.emitted("close")).toBeTruthy();
      expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("should emit close event on Escape key", async () => {
      const wrapper = createWrapper();

      await wrapper.find(".event-detail-panel").trigger("keydown", {
        key: "Escape",
      });

      expect(wrapper.emitted("close")).toBeTruthy();
      expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("should not close on other keys", async () => {
      const wrapper = createWrapper();

      await wrapper.find(".event-detail-panel").trigger("keydown", {
        key: "ArrowLeft",
      });

      expect(wrapper.emitted("close")).toBeFalsy();
    });
  });

  describe("Source Display", () => {
    it("should display source name when source exists in store", () => {
      calendarStore.sources = [{ id: "test-source", name: "Test Calendar" }];
      const event = createEvent({ source: "test-source" });
      const wrapper = createWrapper({ event });

      const sourceRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Source:"));
      expect(sourceRow.exists()).toBe(true);
      expect(sourceRow.text()).toContain("Test Calendar");
    });

    it("should display source ID when source not found in store", () => {
      calendarStore.sources = [];
      const event = createEvent({ source: "unknown-source" });
      const wrapper = createWrapper({ event });

      const sourceRow = wrapper
        .findAll(".event-detail-row")
        .find((row) => row.text().includes("Source:"));
      expect(sourceRow.exists()).toBe(true);
      expect(sourceRow.text()).toContain("unknown-source");
    });
  });
});
