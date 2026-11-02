/**
 * Unit tests for EventDetailPanel — redesigned "the event is the hero" panel:
 * a colour spine, a timetable "when", location/description, and a de-emphasised
 * list of the day's other events.
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

  const createWrapper = (props = {}) =>
    mount(EventDetailPanel, {
      props: { event: createEvent(), ...props },
      global: { plugins: [pinia] },
    });

  describe("Visibility", () => {
    it("renders when an event is provided", () => {
      expect(createWrapper().find(".event-detail-panel").exists()).toBe(true);
    });

    it("does not render when event is null", () => {
      expect(createWrapper({ event: null }).find(".event-detail-panel").exists()).toBe(false);
    });
  });

  describe("Event display", () => {
    it("shows the title", () => {
      const wrapper = createWrapper({ event: createEvent({ title: "Important Meeting" }) });
      expect(wrapper.find(".event-detail__title").text()).toBe("Important Meeting");
    });

    it("carries the event colour onto the panel spine", () => {
      const wrapper = createWrapper({ event: createEvent({ color: "#5ab58a" }) });
      expect(wrapper.find(".event-detail-panel").attributes("style")).toContain("#5ab58a");
      expect(wrapper.find(".event-detail__spine").exists()).toBe(true);
    });

    it("shows the time and day for a single-day timed event", () => {
      const wrapper = createWrapper();
      expect(wrapper.find(".event-detail__time").text()).toMatch(/\d{1,2}:\d{2}/);
      expect(wrapper.find(".event-detail__subwhen").text()).toBeTruthy();
    });

    it("shows an all-day marker instead of a time", () => {
      const wrapper = createWrapper({
        event: createEvent({
          start: "2024-01-15T00:00:00",
          end: "2024-01-15T23:59:59",
          all_day: true,
        }),
      });
      expect(wrapper.find(".event-detail__time").text()).toBe("All day");
    });

    it("shows the location when provided", () => {
      const wrapper = createWrapper({ event: createEvent({ location: "Conference Room A" }) });
      const where = wrapper.find(".event-detail__where");
      expect(where.exists()).toBe(true);
      expect(where.text()).toContain("Conference Room A");
    });

    it("shows the description when provided", () => {
      const wrapper = createWrapper({ event: createEvent({ description: "A test description" }) });
      expect(wrapper.find(".event-detail__desc").text()).toContain("A test description");
    });
  });

  describe("Multi-day events", () => {
    it("shows a from/to range instead of a single time", () => {
      const wrapper = createWrapper({
        event: createEvent({ start: "2024-01-15T10:00:00", end: "2024-01-17T14:00:00" }),
      });
      expect(wrapper.find(".event-detail__range").exists()).toBe(true);
      const dates = wrapper.findAll(".event-detail__range-date");
      expect(dates).toHaveLength(2);
      expect(dates[0].text()).toContain("15");
      expect(dates[1].text()).toContain("17");
    });

    it("does not show the single-day time block", () => {
      const wrapper = createWrapper({
        event: createEvent({ start: "2024-01-15T10:00:00", end: "2024-01-17T14:00:00" }),
      });
      expect(wrapper.find(".event-detail__when").exists()).toBe(false);
    });
  });

  describe("The day's other events", () => {
    it("lists the other events for the day, excluding the current one", () => {
      const event1 = createEvent({ id: "1", title: "Event 1" });
      const event2 = createEvent({ id: "2", title: "Event 2" });
      calendarStore.dayEvents = [event1, event2];

      const wrapper = createWrapper({ event: event1 });
      const items = wrapper.findAll(".event-detail__also-item");
      expect(items).toHaveLength(1);
      expect(items[0].text()).toContain("Event 2");
    });

    it("selects another event when its row is clicked", async () => {
      const event1 = createEvent({ id: "1", title: "Event 1" });
      const event2 = createEvent({ id: "2", title: "Event 2" });
      calendarStore.dayEvents = [event1, event2];
      const spy = vi.spyOn(calendarStore, "selectEvent");

      const wrapper = createWrapper({ event: event1 });
      await wrapper.find(".event-detail__also-item").trigger("click");

      expect(spy).toHaveBeenCalledWith(event2);
    });

    it("has no footer list when the event is the only one that day", () => {
      calendarStore.dayEvents = [createEvent({ id: "1" })];
      const wrapper = createWrapper({ event: createEvent({ id: "1" }) });
      expect(wrapper.find(".event-detail__also").exists()).toBe(false);
    });
  });

  describe("Close", () => {
    it("emits close when the close button is clicked", async () => {
      const wrapper = createWrapper();
      await wrapper.find('[aria-label="Close"]').trigger("click");
      expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("emits close on Escape", async () => {
      const wrapper = createWrapper();
      await wrapper.find(".event-detail-panel").trigger("keydown", { key: "Escape" });
      expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("does not close on other keys", async () => {
      const wrapper = createWrapper();
      await wrapper.find(".event-detail-panel").trigger("keydown", { key: "ArrowLeft" });
      expect(wrapper.emitted("close")).toBeFalsy();
    });
  });

  describe("Calendar / source", () => {
    it("shows the calendar name when the source is known", () => {
      calendarStore.sources = [{ id: "test-source", name: "Test Calendar" }];
      const wrapper = createWrapper({ event: createEvent({ source: "test-source" }) });
      expect(wrapper.find(".event-detail__calendar").text()).toContain("Test Calendar");
    });

    it("falls back to the source id when the calendar is unknown", () => {
      calendarStore.sources = [];
      const wrapper = createWrapper({ event: createEvent({ source: "unknown-source" }) });
      expect(wrapper.find(".event-detail__calendar").text()).toContain("unknown-source");
    });
  });
});
