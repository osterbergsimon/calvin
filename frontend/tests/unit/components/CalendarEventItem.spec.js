/**
 * Unit tests for CalendarEventItem component
 * Tests functionality: event display, multi-day events, focus/selection, click handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import CalendarEventItem from "@/components/CalendarEventItem.vue";
import { useEventHelpers } from "@/composables/useEventHelpers";

// Mock useEventHelpers
vi.mock("@/composables/useEventHelpers", () => ({
  useEventHelpers: vi.fn(),
}));

describe("CalendarEventItem", () => {
  let mockEventHelpers;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    mockEventHelpers = {
      getEventColor: vi.fn(() => "#2196F3"),
      getEventTitle: vi.fn(event => event.title || "Event"),
      getEventDisplayText: vi.fn(event => {
        if (event.start && event.end) {
          return `${event.title || "Event"} ${event.start} - ${event.end}`;
        }
        return event.title || "Event";
      }),
      truncateEventTitle: vi.fn((title, length) => {
        if (title.length <= length) return title;
        return title.substring(0, length) + "...";
      }),
    };

    useEventHelpers.mockReturnValue(mockEventHelpers);
  });

  const createEvent = (overrides = {}) => ({
    id: "1",
    title: "Test Event",
    start: "2024-01-15T10:00:00",
    end: "2024-01-15T12:00:00",
    color: "#2196F3",
    _isMultiDay: false,
    _isStart: false,
    _isEnd: false,
    _isMiddle: false,
    ...overrides,
  });

  const createWrapper = (props = {}) => {
    const defaultProps = {
      event: createEvent(),
      dayIndex: 0,
      eventIndex: 0,
      dayDate: new Date("2024-01-15"),
      isFocused: false,
      isSelected: false,
      ...props,
    };

    return mount(CalendarEventItem, {
      props: defaultProps,
    });
  };

  describe("Event Display", () => {
    it("should display event title", () => {
      const event = createEvent({ title: "Meeting with Team" });
      const wrapper = createWrapper({ event });

      expect(wrapper.text()).toContain("Meeting with Team");
      expect(mockEventHelpers.getEventDisplayText).toHaveBeenCalledWith(event);
    });

    it("should display full text for single-day events", () => {
      const event = createEvent({ _isMultiDay: false, _isStart: false });
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-text").exists()).toBe(true);
      expect(wrapper.find(".event-continuation").exists()).toBe(false);
    });

    it("should display full text for start of multi-day events", () => {
      const event = createEvent({
        _isMultiDay: true,
        _isStart: true,
        _isEnd: false,
        _isMiddle: false,
      });
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-text").exists()).toBe(true);
      expect(wrapper.find(".event-continuation").exists()).toBe(false);
    });

    it("should display continuation for middle/end of multi-day events", () => {
      const event = createEvent({
        _isMultiDay: true,
        _isStart: false,
        _isEnd: false,
        _isMiddle: true,
        title: "Long Multi-Day Event Name",
      });
      mockEventHelpers.truncateEventTitle.mockReturnValue("Long Multi-Day...");
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-continuation").exists()).toBe(true);
      expect(wrapper.find(".continuation-arrow").text()).toBe("←");
      expect(wrapper.find(".continuation-text").text()).toBe("Long Multi-Day...");
    });
  });

  describe("Multi-Day Event Segments", () => {
    it("should apply start class for start segment", () => {
      const event = createEvent({
        _isMultiDay: true,
        _isStart: true,
        _isEnd: false,
        _isMiddle: false,
      });
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-item").classes()).toContain("event-start");
      expect(wrapper.find(".event-item").classes()).toContain("event-multi-day");
    });

    it("should apply end class for end segment", () => {
      const event = createEvent({
        _isMultiDay: true,
        _isStart: false,
        _isEnd: true,
        _isMiddle: false,
      });
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-item").classes()).toContain("event-end");
      expect(wrapper.find(".event-item").classes()).toContain("event-multi-day");
    });

    it("should apply middle class for middle segment", () => {
      const event = createEvent({
        _isMultiDay: true,
        _isStart: false,
        _isEnd: false,
        _isMiddle: true,
      });
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-item").classes()).toContain("event-middle");
      expect(wrapper.find(".event-item").classes()).toContain("event-multi-day");
    });
  });

  describe("Focus and Selection States", () => {
    it("should apply focused class when isFocused is true", () => {
      const wrapper = createWrapper({ isFocused: true });

      expect(wrapper.find(".event-item").classes()).toContain("focused");
    });

    it("should apply selected class when isSelected is true", () => {
      const wrapper = createWrapper({ isSelected: true });

      expect(wrapper.find(".event-item").classes()).toContain("selected");
    });

    it("should apply both focused and selected classes", () => {
      const wrapper = createWrapper({ isFocused: true, isSelected: true });

      expect(wrapper.find(".event-item").classes()).toContain("focused");
      expect(wrapper.find(".event-item").classes()).toContain("selected");
    });
  });

  describe("Event Color", () => {
    it("should use event color from useEventHelpers", () => {
      const event = createEvent({ color: "#FF5722" });
      mockEventHelpers.getEventColor.mockReturnValue("#FF5722");
      const wrapper = createWrapper({ event });

      const style = wrapper.find(".event-item").attributes("style");
      // Browser may convert hex to rgb, so check for either
      expect(
        style.includes("background-color: #FF5722") ||
          style.includes("background-color: rgb(255, 87, 34)")
      ).toBe(true);
      expect(mockEventHelpers.getEventColor).toHaveBeenCalledWith(event);
    });
  });

  describe("User Interactions", () => {
    it("should emit click event when clicked", async () => {
      const event = createEvent();
      const dayDate = new Date("2024-01-15");
      const wrapper = createWrapper({ event, dayDate });

      await wrapper.find(".event-item").trigger("click");

      expect(wrapper.emitted("click")).toBeTruthy();
      expect(wrapper.emitted("click")[0]).toEqual([event, dayDate]);
    });

    it("should emit click event on Enter key", async () => {
      const event = createEvent();
      const dayDate = new Date("2024-01-15");
      const wrapper = createWrapper({ event, dayDate });

      await wrapper.find(".event-item").trigger("keydown.enter");

      expect(wrapper.emitted("click")).toBeTruthy();
      expect(wrapper.emitted("click")[0]).toEqual([event, dayDate]);
    });

    it("should emit click event on Space key", async () => {
      const event = createEvent();
      const dayDate = new Date("2024-01-15");
      const wrapper = createWrapper({ event, dayDate });

      await wrapper.find(".event-item").trigger("keydown.space");

      expect(wrapper.emitted("click")).toBeTruthy();
      expect(wrapper.emitted("click")[0]).toEqual([event, dayDate]);
    });

    it("should emit focus event when focused", async () => {
      const wrapper = createWrapper({
        dayIndex: 2,
        eventIndex: 3,
      });

      await wrapper.find(".event-item").trigger("focus");

      expect(wrapper.emitted("focus")).toBeTruthy();
      expect(wrapper.emitted("focus")[0]).toEqual([2, 3]);
    });
  });

  describe("Exposed Methods", () => {
    it("should expose focus method", () => {
      const wrapper = createWrapper();
      const focusSpy = vi.spyOn(wrapper.find(".event-item").element, "focus");

      wrapper.vm.focus();

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe("Title and Accessibility", () => {
    it("should set title attribute for tooltip", () => {
      const event = createEvent({ title: "Important Meeting" });
      mockEventHelpers.getEventTitle.mockReturnValue("Important Meeting");
      const wrapper = createWrapper({ event });

      expect(wrapper.find(".event-item").attributes("title")).toBe("Important Meeting");
      expect(mockEventHelpers.getEventTitle).toHaveBeenCalledWith(event);
    });

    it("should be keyboard accessible with tabindex", () => {
      const wrapper = createWrapper();

      expect(wrapper.find(".event-item").attributes("tabindex")).toBe("0");
    });
  });
});
