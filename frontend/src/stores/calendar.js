import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "../utils/cache";
import { useConnectionStore } from "./connection";

export const useCalendarStore = defineStore("calendar", () => {
  const events = ref([]);
  const sources = ref([]); // Calendar sources with colors and show_time settings
  const loading = ref(false);
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
        console.log(`[Calendar] Using cached sources (${cachedSources.sources?.length || 0} sources)`);
        sources.value = cachedSources.sources || [];
        loading.value = false;
        return cachedSources;
      }
    }
    
    try {
      const response = await axios.get("/api/calendar/sources");
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
          console.log(`[Calendar] Request failed, using cached sources (${cachedSources.sources?.length || 0} sources)`);
          sources.value = cachedSources.sources || [];
          loading.value = false;
          return cachedSources;
        }
      }
      
      error.value = err.message;
      console.error("Failed to fetch calendar sources:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateSource = async (sourceId, updates) => {
    try {
      const response = await axios.put(
        `/api/calendar/sources/${sourceId}`,
        updates,
      );
      // Update local sources
      const index = sources.value.findIndex((s) => s.id === sourceId);
      if (index !== -1) {
        sources.value[index] = response.data;
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to update calendar source:", err);
      throw err;
    }
  };

  const getSourceColor = (sourceId) => {
    const source = sources.value.find((s) => s.id === sourceId);
    return source?.color || "#2196f3"; // Default color
  };

  const shouldShowTime = (sourceId) => {
    const source = sources.value.find((s) => s.id === sourceId);
    return source?.show_time !== false; // Default to true
  };

  const fetchEvents = async (startDate, endDate, refreshParam = "") => {
    loading.value = true;
    error.value = null;
    
    const connectionStore = useConnectionStore();
    const cacheKey = `calendar_events_${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const cacheTTL = 30 * 60 * 1000; // 30 minutes
    
    // Try to load from cache first if offline
    if (!connectionStore.isFullyOnline()) {
      const cachedEvents = getCachedData(cacheKey, cacheTTL);
      if (cachedEvents) {
        console.log(`[Calendar] Using cached events (${cachedEvents.events?.length || 0} events)`);
        events.value = cachedEvents.events || [];
        loading.value = false;
        return cachedEvents;
      }
    }
    
    try {
      const params = {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      };

      // Add refresh parameter if provided (for cache busting)
      if (refreshParam) {
        // Parse refresh param - could be a query string or boolean
        if (
          typeof refreshParam === "string" &&
          refreshParam.includes("refresh=")
        ) {
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
      const responseData = response.data;
      events.value = responseData.events || [];
      
      // Cache the response
      setCachedData(cacheKey, responseData);
      
      console.log(`Fetched ${events.value.length} events from API`);
      if (events.value.length > 0) {
        console.log("Sample event:", events.value[0]);
      }
      return responseData;
    } catch (err) {
      // If online but request failed, try cache
      if (connectionStore.isFullyOnline()) {
        const cachedEvents = getCachedData(cacheKey, cacheTTL);
        if (cachedEvents) {
          console.log(`[Calendar] Request failed, using cached events (${cachedEvents.events?.length || 0} events)`);
          events.value = cachedEvents.events || [];
          loading.value = false;
          return cachedEvents;
        }
      }
      
      error.value = err.message;
      console.error("Failed to fetch events:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const setCurrentDate = (date) => {
    currentDate.value = date;
  };

  // Helper to get calendar date components (year, month, day only)
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

  const selectEvent = (event, selectedDayDate = null) => {
    selectedEvent.value = event;
    // Store the selected date (the actual day that was clicked, not the event's start date)
    // This is important for multi-day events
    if (selectedDayDate) {
      selectedDate.value = new Date(selectedDayDate);
    } else if (event) {
      // Fallback to event's start date if no day date provided
      selectedDate.value = new Date(event.start);
    } else {
      selectedDate.value = null;
    }
    
    // Also collect all events for the same day using the same logic as CalendarView
    if (event) {
      // Use the selected date (the actual day clicked) instead of event's start date
      const dateToUse = selectedDate.value || new Date(event.start);
      const eventStart = dateToUse;

      // Get the calendar date of the selected day
      let eventDateComponents;
      if (event.all_day) {
        // For all-day events, use the selected date components
        eventDateComponents = getDateComponents(eventStart, false);
      } else {
        // For timed events, use the selected date
        eventDateComponents = getDateComponents(eventStart, false);
      }

      dayEvents.value = events.value.filter((e) => {
        const eStart = new Date(e.start);
        const eEnd = new Date(e.end);

        if (e.all_day) {
          // All-day events: compare calendar date components
          const eStartComponents = getDateComponents(eStart, false);

          // Calculate end date from start + duration for all-day events
          const durationMs = eEnd.getTime() - eStart.getTime();
          const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const eEndDate = new Date(eStart);
          eEndDate.setDate(eStart.getDate() + durationDays);
          const eEndComponentsCalc = getDateComponents(eEndDate, false);

          // Check if event date is between start and end (inclusive)
          const startCompare = compareDateComponents(
            eStartComponents,
            eventDateComponents,
          );
          const endCompare = compareDateComponents(
            eventDateComponents,
            eEndComponentsCalc,
          );
          return startCompare <= 0 && endCompare <= 0;
        } else {
          // Timed events: check if event overlaps with the selected event's day
          const eStartComponents = getDateComponents(eStart, false);
          const eEndComponents = getDateComponents(eEnd, false);

          // Check if event date is between start and end (inclusive)
          const startCompare = compareDateComponents(
            eStartComponents,
            eventDateComponents,
          );
          const endCompare = compareDateComponents(
            eventDateComponents,
            eEndComponents,
          );
          return startCompare <= 0 && endCompare <= 0;
        }
      });
    }
  };

  const setDayEvents = (events) => {
    dayEvents.value = events;
  };

  const setShowAllDayEvents = (show) => {
    showAllDayEvents.value = show;
  };

  const clearSelectedEvent = () => {
    selectedEvent.value = null;
    selectedDate.value = null;
    dayEvents.value = [];
    showAllDayEvents.value = false;
  };

  return {
    events,
    sources,
    loading,
    error,
    currentDate,
    selectedEvent,
    selectedDate,
    dayEvents,
    showAllDayEvents,
    fetchEvents,
    fetchSources,
    updateSource,
    getSourceColor,
    shouldShowTime,
    setCurrentDate,
    selectEvent,
    setDayEvents,
    setShowAllDayEvents,
    clearSelectedEvent,
  };
});
