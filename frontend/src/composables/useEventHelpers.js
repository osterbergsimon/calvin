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
   * Format just the start time (HH:MM) — used by the compact month-view
   * timed-event rows where the end time would be noise.
   */
  const formatEventStartTime = event => {
    if (event.all_day) {
      return "";
    }
    const start = new Date(event.start);
    const timeFormat = configStore.timeFormat || "24h";
    const timeOptions =
      timeFormat === "24h"
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : { hour: "numeric", minute: "2-digit", hour12: true };
    return start.toLocaleTimeString("en-US", timeOptions);
  };

  /**
   * Ink for text drawn on an event chip.
   *
   * A chip is painted in the calendar's own colour, not in a theme surface, so
   * the ink cannot come from the theme: pick the light or dark chip ink by the
   * colour's luminance (WCAG threshold: white needs L <= 0.183). Both inks are
   * theme tokens (`--on-event-ink`, `--on-event-ink-dark`) so this only decides
   * which of the two applies.
   */
  const getEventInk = event => {
    const hex = String(getEventColor(event) || "").replace("#", "");
    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return "var(--on-event-ink)";
    const full = hex.length === 3 ? [...hex].map(c => c + c).join("") : hex;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
    const linear = channel =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    return luminance > 0.183 ? "var(--on-event-ink-dark)" : "var(--on-event-ink)";
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
    getEventInk,
    formatEventTime,
    formatEventStartTime,
    getEventTitle,
    truncateEventTitle,
    getEventDisplayText,
  };
}
