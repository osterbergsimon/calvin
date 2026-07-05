import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "../utils/cache";
import { useConnectionStore } from "./connection";
import { logDebug, logError, logInfo } from "../utils/logger";

/**
 * Generated API types from backend OpenAPI snapshot.
 * Run `npm run gen:api` to refresh after backend route/schema changes.
 * @typedef {import("../api/types").components["schemas"]["CalendarSourcesResponse"]} CalendarSourcesResponse
 * @typedef {import("../api/types").components["schemas"]["CalendarEventsResponse"]} CalendarEventsResponse
 */

export const useCalendarStore = defineStore("calendar", () => {
  const events = ref([]);
  const eventsBySourceKey = ref({});
  const sources = ref([]); // Calendar sources with colors and show_time settings
  const loading = ref(false);
  const backgroundRefreshing = ref(false);
  const error = ref(null);
  const currentDate = ref(new Date());
  const selectedEvent = ref(null); // Currently selected/expanded event
  const selectedDate = ref(null); // The actual date that was selected (for multi-day events)
  const dayEvents = ref([]); // All events for the expanded day
  const showAllDayEvents = ref(false); // Flag to show all events' details when expanding "today"

  const fetchSources = async () => {
    loading.value = true;
    error.value = null;

    const connectionStore = useConnectionStore();
    const cacheKey = "calendar_sources";
    const cacheTTL = 60 * 60 * 1000; // 1 hour

    // Try to load from cache first if offline
    if (!connectionStore.isFullyOnline()) {
      const cachedSources = getCachedData(cacheKey, cacheTTL);
      if (cachedSources) {
        logInfo(
          "[Calendar]",
          `Using cached sources (${cachedSources.sources?.length || 0} sources)`
        );
        sources.value = cachedSources.sources || [];
        loading.value = false;
        return cachedSources;
      }
    }

    try {
      const response = await axios.get("/api/calendar/sources");
      /** @type {CalendarSourcesResponse} */
      const responseData = response.data;
      sources.value = responseData.sources || [];

      // Cache the response
      setCachedData(cacheKey, responseData);

      return responseData;
    } catch (err) {
      // If online but request failed, try cache
      if (connectionStore.isFullyOnline()) {
        const cachedSources = getCachedData(cacheKey, cacheTTL);
        if (cachedSources) {
          logInfo(
            "[Calendar]",
            `Request failed, using cached sources (${cachedSources.sources?.length || 0} sources)`
          );
          sources.value = cachedSources.sources || [];
          loading.value = false;
          return cachedSources;
        }
      }

      error.value = err.message;
      logError("[Calendar]", "Failed to fetch calendar sources:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateSource = async (sourceId, updates) => {
    try {
      const response = await axios.put(`/api/calendar/sources/${sourceId}`, updates);
      // Update local sources
      const index = sources.value.findIndex(s => s.id === sourceId);
      if (index !== -1) {
        sources.value[index] = response.data;
      }
      // Refresh the cache so an offline reload after this edit doesn't revert it
      setCachedData("calendar_sources", { sources: sources.value });
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[Calendar]", "Failed to update calendar source:", err);
      throw err;
    }
  };

  const getSourceColor = sourceId => {
    const source = sources.value.find(s => s.id === sourceId);
    return source?.color || "#2196f3"; // Default color
  };

  const shouldShowTime = sourceId => {
    const source = sources.value.find(s => s.id === sourceId);
    return source?.show_time !== false; // Default to true
  };

  const normalizeSourceIds = sourceIds =>
    Array.isArray(sourceIds)
      ? [
          ...new Set(
            sourceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
          ),
        ].sort()
      : [];

  const getSourceKey = sourceIds => {
    const ids = normalizeSourceIds(sourceIds);
    return ids.length ? ids.join(",") : "__all__";
  };

  const getEventsForSource = sourceIds => eventsBySourceKey.value[getSourceKey(sourceIds)] || [];

  const fetchEvents = async (
    startDate,
    endDate,
    refreshParam = "",
    background = false,
    sourceIds = []
  ) => {
    if (background) {
      backgroundRefreshing.value = true;
    } else {
      loading.value = true;
    }
    error.value = null;

    const connectionStore = useConnectionStore();
    const normalizedSourceIds = normalizeSourceIds(sourceIds);
    const sourceKey = getSourceKey(normalizedSourceIds);
    const cacheKey = `calendar_events_${sourceKey}_${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const cacheTTL = 30 * 60 * 1000; // 30 minutes

    // Try to load from cache first if offline
    if (!connectionStore.isFullyOnline()) {
      const cachedEvents = getCachedData(cacheKey, cacheTTL);
      if (cachedEvents) {
        logInfo("[Calendar]", `Using cached events (${cachedEvents.events?.length || 0} events)`);
        eventsBySourceKey.value[sourceKey] = cachedEvents.events || [];
        if (sourceKey === "__all__") events.value = cachedEvents.events || [];
        loading.value = false;
        return cachedEvents;
      }
    }

    try {
      const params = {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      };
      if (normalizedSourceIds.length > 0) {
        params.source_ids = normalizedSourceIds.join(",");
      }

      // Add refresh parameter if provided (for cache busting)
      if (refreshParam) {
        // Parse refresh param - could be a query string or boolean
        if (typeof refreshParam === "string" && refreshParam.includes("refresh=")) {
          // Extract refresh value from query string
          const refreshMatch = refreshParam.match(/refresh=([^&]*)/);
          if (refreshMatch) {
            params.refresh = true;
          }
        } else if (refreshParam === true || refreshParam === "true") {
          params.refresh = true;
        }
      }

      const response = await axios.get("/api/calendar/events", { params });
      /** @type {CalendarEventsResponse} */
      const responseData = response.data;
      eventsBySourceKey.value[sourceKey] = responseData.events || [];
      if (sourceKey === "__all__") {
        events.value = responseData.events || [];
      }

      // Cache the response
      setCachedData(cacheKey, responseData);

      logDebug("[Calendar]", `Fetched ${responseData.events?.length || 0} events from API`);
      if (responseData.events?.length > 0) {
        logDebug("[Calendar]", "Sample event:", responseData.events[0]);
      }
      return responseData;
    } catch (err) {
      // If online but request failed, try cache
      if (connectionStore.isFullyOnline()) {
        const cachedEvents = getCachedData(cacheKey, cacheTTL);
        if (cachedEvents) {
          logInfo(
            "[Calendar]",
            `Request failed, using cached events (${cachedEvents.events?.length || 0} events)`
          );
          eventsBySourceKey.value[sourceKey] = cachedEvents.events || [];
          if (sourceKey === "__all__") events.value = cachedEvents.events || [];
          loading.value = false;
          return cachedEvents;
        }
      }

      error.value = err.message;
      logError("[Calendar]", "Failed to fetch events:", err);
      throw err;
    } finally {
      loading.value = false;
      backgroundRefreshing.value = false;
    }
  };

  const setCurrentDate = date => {
    currentDate.value = date;
  };

  // Helper to normalize a date to calendar date (year, month, day only)
  // For timed events: uses local time methods (to match calendar grid which is in local time)
  const getCalendarDate = (date, useUTC = false) => {
    const d = new Date(date);
    if (useUTC) {
      // Use UTC methods for all-day events (backend sends UTC dates)
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    } else {
      // Use local time methods for timed events (to match calendar grid)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  };

  // Helper to get calendar date components (year, month, day only) for direct comparison
  const getDateComponents = (date, useUTC = false) => {
    const d = new Date(date);
    if (useUTC) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        day: d.getUTCDate(),
      };
    } else {
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    }
  };

  // Helper to compare date components
  const compareDateComponents = (date1, date2) => {
    if (date1.year !== date2.year) return date1.year - date2.year;
    if (date1.month !== date2.month) return date1.month - date2.month;
    return date1.day - date2.day;
  };

  const selectEvent = (event, selectedDayDate = null, sourceIds = []) => {
    const sourceEvents = getEventsForSource(sourceIds);
    const eventPool =
      sourceEvents.length > 0 || getSourceKey(sourceIds) !== "__all__"
        ? sourceEvents
        : events.value;
    // Find the event in the main events array to ensure we're using the same object reference
    // This helps with reactivity and ensures consistent comparisons
    const eventFromMainArray = eventPool.find(e => {
      // Compare IDs as strings to ensure consistent comparison
      return String(e.id) === String(event.id);
    });
    // Assign the event - Vue should detect this change
    selectedEvent.value = eventFromMainArray || event;
    // Store the selected date (the actual day that was clicked, not the event's start date)
    // This is important for multi-day events
    // Normalize the date to ensure consistent comparison
    if (selectedDayDate) {
      // Normalize to calendar date (midnight) to match CalendarView's day.date
      // This happens when clicking an event directly from the calendar view
      selectedDate.value = getCalendarDate(selectedDayDate, false);
    } else if (event && selectedDate.value) {
      // If we already have a selectedDate and no selectedDayDate is provided,
      // we're switching between events in the detail panel.
      // Since all events in dayEvents are already filtered to be on the same day
      // (the selectedDate), we should ALWAYS preserve the selectedDate when
      // clicking any event in the detail panel. This ensures all events that
      // were originally shown stay visible when switching between them.
      // Just normalize it to ensure it's a calendar date
      selectedDate.value = getCalendarDate(selectedDate.value, false);
    } else if (event) {
      // Fallback to event's start date if no day date provided and no existing selectedDate
      selectedDate.value = getCalendarDate(event.start, false);
    } else {
      selectedDate.value = null;
    }

    // Also collect all events for the same day using the exact same logic as CalendarView.getEventsForDate
    if (event && selectedDate.value) {
      // Use the selected date (the actual day clicked) - already normalized to calendar date
      // This matches CalendarView's day.date which is passed to getEventsForDate
      const dateToUse = selectedDate.value;

      // Get the calendar date of the selected day (same logic as CalendarView line 315)
      // Calendar grid date is in local time
      const dateOnly = getCalendarDate(dateToUse, false); // false = use local time
      const dateEnd = new Date(dateOnly);
      dateEnd.setHours(23, 59, 59, 999);

      // Get grid date components (local time) - same as CalendarView line 320
      const gridDateComponents = getDateComponents(dateToUse, false);

      // Filter events using the exact same logic as CalendarView.getEventsForDate
      dayEvents.value = eventPool
        .filter(e => {
          const eStart = new Date(e.start);
          const eEnd = new Date(e.end);

          if (e.all_day) {
            // All-day events: compare calendar date components (same as CalendarView)
            const eStartComponents = getDateComponents(eStart, false);

            // Calculate end date from start + duration for all-day events
            const durationMs = eEnd.getTime() - eStart.getTime();
            const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const eEndDate = new Date(eStart);
            eEndDate.setDate(eStart.getDate() + durationDays);
            const eEndComponentsCalc = getDateComponents(eEndDate, false);

            // Check if event date is between start and end (inclusive)
            const startCompare = compareDateComponents(eStartComponents, gridDateComponents);
            const endCompare = compareDateComponents(gridDateComponents, eEndComponentsCalc);
            return startCompare <= 0 && endCompare <= 0;
          } else {
            // Timed events: check if the date falls within the event's time range
            // Event spans the day if: eventStart <= dateEnd AND eventEnd >= dateOnly
            // (Same logic as CalendarView - must match exactly)
            // Use direct Date comparison (same as CalendarView line 362)
            return eStart <= dateEnd && eEnd >= dateOnly;
          }
        })
        .sort((a, b) => {
          // Sort events in the same order as CalendarView:
          // 1. Multi-day events first
          // 2. Then all-day events before timed events
          // 3. Then by start time (earlier first)

          // Check if events are multi-day
          const aIsMultiDay = (() => {
            const aStart = new Date(a.start);
            const aEnd = new Date(a.end);
            if (a.all_day) {
              const durationMs = aEnd.getTime() - aStart.getTime();
              const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
              return durationDays > 0;
            } else {
              const aStartComp = getDateComponents(aStart, false);
              const aEndComp = getDateComponents(aEnd, false);
              return compareDateComponents(aStartComp, aEndComp) !== 0;
            }
          })();

          const bIsMultiDay = (() => {
            const bStart = new Date(b.start);
            const bEnd = new Date(b.end);
            if (b.all_day) {
              const durationMs = bEnd.getTime() - bStart.getTime();
              const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
              return durationDays > 0;
            } else {
              const bStartComp = getDateComponents(bStart, false);
              const bEndComp = getDateComponents(bEnd, false);
              return compareDateComponents(bStartComp, bEndComp) !== 0;
            }
          })();

          // Multi-day events first
          if (aIsMultiDay && !bIsMultiDay) return -1;
          if (!aIsMultiDay && bIsMultiDay) return 1;

          // Then all-day events before timed events
          if (a.all_day && !b.all_day) return -1;
          if (!a.all_day && b.all_day) return 1;

          // Then by start time (earlier first)
          const aStart = new Date(a.start).getTime();
          const bStart = new Date(b.start).getTime();
          return aStart - bStart;
        });
    }
  };

  const setDayEvents = events => {
    dayEvents.value = events;
  };

  const setShowAllDayEvents = show => {
    showAllDayEvents.value = show;
  };

  const clearSelectedEvent = () => {
    selectedEvent.value = null;
    selectedDate.value = null;
    dayEvents.value = [];
    showAllDayEvents.value = false;
  };

  const refreshEvents = async () => {
    /** Manually refresh calendar cache and reload events. */
    try {
      // Call the backend refresh endpoint to clear cache and reload
      await axios.post("/api/calendar/refresh");

      // Reload events for the current view
      // Calculate the date range based on current date (same logic as CalendarView.loadEvents)
      const currentYear = currentDate.value.getFullYear();
      const currentMonth = currentDate.value.getMonth();

      // Calculate start and end dates for the current month plus buffer for multi-day events
      // This matches the logic in CalendarView.vue for month view
      const startDate = new Date(currentYear, currentMonth, 1);
      startDate.setDate(startDate.getDate() - 7); // 7 days before month start
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(currentYear, currentMonth + 1, 0);
      endDate.setDate(endDate.getDate() + 7); // 7 days after month end
      endDate.setHours(23, 59, 59, 999);

      // Reload events with refresh flag
      await fetchEvents(startDate, endDate, true);

      logInfo("[Calendar]", "Events refreshed successfully");
    } catch (err) {
      error.value = err.message;
      logError("[Calendar]", "Failed to refresh events:", err);
      throw err;
    }
  };

  return {
    events,
    eventsBySourceKey,
    sources,
    loading,
    backgroundRefreshing,
    error,
    currentDate,
    selectedEvent,
    selectedDate,
    dayEvents,
    showAllDayEvents,
    fetchEvents,
    getEventsForSource,
    fetchSources,
    updateSource,
    getSourceColor,
    shouldShowTime,
    setCurrentDate,
    selectEvent,
    setDayEvents,
    setShowAllDayEvents,
    clearSelectedEvent,
    refreshEvents,
  };
});
