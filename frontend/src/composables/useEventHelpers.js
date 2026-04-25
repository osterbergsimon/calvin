// import { computed } from "vue";
import { useCalendarStore } from "../stores/calendar";
import { useConfigStore } from "../stores/config";

/**
 * Composable for event-related helper functions
 */
export function useEventHelpers() {
  const calendarStore = useCalendarStore();
  const configStore = useConfigStore();

  /**
   * Get event color from event or calendar source
   */
  const getEventColor = event => {
    // First try event's own color
    if (event.color) {
      return event.color;
    }
    // Then try calendar source color
    // Check if source exists in calendar sources (valid source ID)
    if (event.source && calendarStore.sources.length > 0) {
      const source = calendarStore.sources.find(s => s.id === event.source);
      if (source && source.color) {
        return source.color;
      }
    }
    // Default color
    return "#2196f3";
  };

  /**
   * Format event time based on time format setting
   */
  const formatEventTime = event => {
    if (event.all_day) {
      return "All day";
    }
    const start = new Date(event.start);
    const end = new Date(event.end);
    const timeFormat = configStore.timeFormat || "24h";
    const timeOptions =
      timeFormat === "24h"
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : { hour: "numeric", minute: "2-digit", hour12: true };
    const startTime = start.toLocaleTimeString("en-US", timeOptions);
    const endTime = end.toLocaleTimeString("en-US", timeOptions);
    return `${startTime} - ${endTime}`;
  };

  /**
   * Get event title with time for tooltip
   */
  const getEventTitle = event => {
    const time = formatEventTime(event);
    return `${event.title} (${time})`;
  };

  /**
   * Truncate event title for continuation display
   */
  const truncateEventTitle = (title, maxLength) => {
    if (!title) return "";
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + "...";
  };

  /**
   * Get event display text (with or without time based on source settings)
   */
  const getEventDisplayText = event => {
    // Check if we should show time for this event's source
    // Only check if source is a valid source ID (not 'google' or 'mock')
    if (event.source && event.source !== "google" && event.source !== "mock") {
      const showTime = calendarStore.shouldShowTime(event.source);
      if (showTime && !event.all_day) {
        const start = new Date(event.start);
        const timeFormat = configStore.timeFormat || "24h";
        const timeOptions =
          timeFormat === "24h"
            ? { hour: "2-digit", minute: "2-digit", hour12: false }
            : { hour: "numeric", minute: "2-digit", hour12: true };
        const time = start.toLocaleTimeString("en-US", timeOptions);
        return `${time} ${event.title}`;
      }
    } else if (!event.all_day) {
      // For events without a valid source ID, show time by default
      const start = new Date(event.start);
      const timeFormat = configStore.timeFormat || "24h";
      const timeOptions =
        timeFormat === "24h"
          ? { hour: "2-digit", minute: "2-digit", hour12: false }
          : { hour: "numeric", minute: "2-digit", hour12: true };
      const time = start.toLocaleTimeString("en-US", timeOptions);
      return `${time} ${event.title}`;
    }
    return event.title;
  };

  return {
    getEventColor,
    formatEventTime,
    getEventTitle,
    truncateEventTitle,
    getEventDisplayText,
  };
}
