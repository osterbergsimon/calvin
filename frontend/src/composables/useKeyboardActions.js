import { nextTick } from "vue";
import { useModeStore } from "../stores/mode";
import { useCalendarStore } from "../stores/calendar";
import { useImagesStore } from "../stores/images";
import { useWebServicesStore } from "../stores/webServices";
import { useConfigStore } from "../stores/config";
import { useRouter } from "vue-router";
import { logInfo, logError, logWarn, logDebug } from "../utils/logger";
import {
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  getActiveDashboardRegion,
  getActiveDashboardScreen,
  getLeafRegions,
  setActiveDashboardRegion,
  setActiveDashboardScreen,
} from "../utils/layout";

// Back-compat: stored mappings from before py5 (vocabulary unfreeze) may still
// carry the old `mode_*` action values. The three jump actions were renamed to
// reflect what they actually do (jump to the first screen containing a region
// kind — never a mode switch); the two dead actions collapse to "none". A DB
// migration rewrites persisted rows, but resolve here too so un-migrated
// clients (localStorage caches, older exports) degrade gracefully.
const LEGACY_ACTION_ALIASES = {
  mode_calendar: "screen_jump_calendar",
  mode_photos: "screen_jump_photos",
  mode_web_services: "screen_jump_services",
  mode_cycle: "none",
  mode_spare: "none",
};

/**
 * Composable for handling keyboard actions.
 * Maps keyboard actions to actual functions.
 */
export function useKeyboardActions() {
  const modeStore = useModeStore();
  const calendarStore = useCalendarStore();
  const imagesStore = useImagesStore();
  const webServicesStore = useWebServicesStore();
  const configStore = useConfigStore();
  const router = useRouter();

  const getDashboardScreens = () => configStore.effectiveDashboardScreens;

  const getActiveRegion = () => {
    const screen = getActiveDashboardScreen(getDashboardScreens());
    return getActiveDashboardRegion(screen);
  };

  const activeRegionKindIs = kind => getActiveRegion()?.kind === kind;

  // The focused calendar region's base view mode (per-region; falls back to
  // "month"). Calendar navigation + view-cycle key off this, not global config.
  const activeCalendarViewMode = () => {
    const region = getActiveRegion();
    return region?.kind === "calendar" ? (region.view?.mode ?? "month") : "month";
  };

  const saveDashboardScreens = screens => {
    if (typeof configStore.setDashboardScreens === "function") {
      configStore.setDashboardScreens(screens);
    }
    if (typeof configStore.updateConfig === "function") {
      configStore.updateConfig({ dashboardScreens: screens }).catch(err => {
        logError("[Keyboard]", "Failed to save dashboard screens:", err);
      });
    }
  };

  const activateScreenByIndex = index => {
    const screensConfig = getDashboardScreens();
    const screen = screensConfig.screens[index];
    if (!screen) return;
    saveDashboardScreens(setActiveDashboardScreen(screensConfig, screen.id));
    router.push("/");
  };

  const activateFirstScreenContainingKind = kind => {
    const screensConfig = getDashboardScreens();
    let matchScreenIndex = -1;
    let matchLeafId = null;
    for (let index = 0; index < screensConfig.screens.length; index += 1) {
      const leaf = getLeafRegions(screensConfig.screens[index].layout).find(
        candidate => candidate.kind === kind
      );
      if (leaf) {
        matchScreenIndex = index;
        matchLeafId = leaf.id;
        break;
      }
    }
    if (matchScreenIndex < 0) return false;
    const screen = screensConfig.screens[matchScreenIndex];
    const nextScreens = setActiveDashboardScreen(
      {
        ...screensConfig,
        screens: screensConfig.screens.map((candidate, index) =>
          index === matchScreenIndex ? { ...candidate, activeRegionId: matchLeafId } : candidate
        ),
      },
      screen.id
    );
    saveDashboardScreens(nextScreens);
    router.push("/");
    return true;
  };

  // Handle calendar mode key press - cycle view mode if already in calendar mode
  const handleCalendarModePress = () => {
    // If we're not in calendar mode, switch to it
    if (modeStore.currentMode !== modeStore.MODES.CALENDAR) {
      // When switching to calendar mode, preserve the current side view
      const currentMode = modeStore.currentMode;
      if (currentMode === modeStore.MODES.WEB_SERVICES) {
        configStore.setLastSideViewMode("web_services");
      } else if (currentMode === modeStore.MODES.PHOTOS) {
        configStore.setLastSideViewMode("photos");
      }
      modeStore.setMode(modeStore.MODES.CALENDAR);
      router.push("/");
      return;
    }

    // We're already in calendar mode - cycle the focused region's base view.
    const region = getActiveRegion();
    if (region?.kind === "calendar" && typeof configStore.updateRegionView === "function") {
      const modes = ["month", "week", "day"];
      const newMode = modes[(modes.indexOf(region.view?.mode ?? "month") + 1) % modes.length];
      configStore
        .updateRegionView(region.id, { mode: newMode })
        .then(() => logInfo("[Keyboard]", `Calendar view mode cycled to: ${newMode}`))
        .catch(err => logError("[Keyboard]", "Failed to cycle calendar view mode:", err));
    }
  };

  // Helper to get calendar date components
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

  // Helper to check if an event is multi-day
  const isEventMultiDay = event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    if (event.all_day) {
      const durationMs = eventEnd.getTime() - eventStart.getTime();
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
      return durationDays > 0;
    } else {
      const eStartComponents = getDateComponents(eventStart, false);
      const eEndComponents = getDateComponents(eventEnd, false);
      return compareDateComponents(eStartComponents, eEndComponents) !== 0;
    }
  };

  // Helper to get events for a specific date (handles multi-day events)
  // Returns events sorted in the same order as the calendar store
  const getEventsForDate = date => {
    if (!calendarStore.events || calendarStore.events.length === 0) return [];

    const dateComponents = getDateComponents(date, false);

    return calendarStore.events
      .filter(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        if (event.all_day) {
          // All-day events: compare calendar date components
          const eStartComponents = getDateComponents(eventStart, false);
          const durationMs = eventEnd.getTime() - eventStart.getTime();
          const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const eEndDate = new Date(eventStart);
          eEndDate.setDate(eventStart.getDate() + durationDays);
          const eEndComponents = getDateComponents(eEndDate, false);

          const startCompare = compareDateComponents(eStartComponents, dateComponents);
          const endCompare = compareDateComponents(dateComponents, eEndComponents);
          return startCompare <= 0 && endCompare <= 0;
        } else {
          // Timed events: check if event overlaps with the date
          const eStartComponents = getDateComponents(eventStart, false);
          const eEndComponents = getDateComponents(eventEnd, false);

          const startCompare = compareDateComponents(eStartComponents, dateComponents);
          const endCompare = compareDateComponents(dateComponents, eEndComponents);
          return startCompare <= 0 && endCompare <= 0;
        }
      })
      .sort((a, b) => {
        // Sort events in the same order as CalendarView and calendar store:
        // 1. Multi-day events first
        // 2. Then all-day events before timed events
        // 3. Then by start time (earlier first)

        const aIsMultiDay = isEventMultiDay(a);
        const bIsMultiDay = isEventMultiDay(b);

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
  };

  // Navigate to next event within the current day, or next day if on last event
  const navigateToNextEvent = () => {
    if (!calendarStore.selectedEvent || !calendarStore.selectedDate) return;

    const currentDate = new Date(calendarStore.selectedDate);
    const dayEvents = calendarStore.dayEvents || [];
    const currentEvent = calendarStore.selectedEvent;

    // If no events for this day (placeholder event), go to next day
    if (dayEvents.length === 0 || currentEvent.id?.toString().startsWith("placeholder-")) {
      navigateToNextDayWithEvents();
      return;
    }

    // Find current event index in dayEvents
    const currentIndex = dayEvents.findIndex(e => String(e.id) === String(currentEvent.id));

    if (currentIndex >= 0 && currentIndex < dayEvents.length - 1) {
      // There's a next event in the same day
      calendarStore.selectEvent(dayEvents[currentIndex + 1], currentDate);
    } else {
      // We're on the last event of the day, go to first event of next day
      navigateToNextDayWithEvents();
    }
  };

  // Navigate to previous event within the current day, or previous day if on first event
  const navigateToPreviousEvent = () => {
    if (!calendarStore.selectedEvent || !calendarStore.selectedDate) return;

    const currentDate = new Date(calendarStore.selectedDate);
    const dayEvents = calendarStore.dayEvents || [];
    const currentEvent = calendarStore.selectedEvent;

    // If no events for this day (placeholder event), go to previous day
    if (dayEvents.length === 0 || currentEvent.id?.toString().startsWith("placeholder-")) {
      navigateToPreviousDayWithEvents();
      return;
    }

    // Find current event index in dayEvents
    const currentIndex = dayEvents.findIndex(e => String(e.id) === String(currentEvent.id));

    // If event not found in dayEvents (shouldn't happen, but handle gracefully)
    if (currentIndex === -1) {
      navigateToPreviousDayWithEvents();
      return;
    }

    if (currentIndex > 0) {
      // There's a previous event in the same day - navigate to it
      calendarStore.selectEvent(dayEvents[currentIndex - 1], currentDate);
    } else {
      // We're on the first event (index 0) of the day
      // Go to the LAST event of the previous day so subsequent prev presses
      // will browse through that day's events in reverse order
      navigateToPreviousDayWithEvents();
    }
  };

  // Navigate to next day with events (skips days without events)
  const navigateToNextDayWithEvents = () => {
    if (!calendarStore.selectedEvent) return;

    // Use the selectedDate (the actual day that was clicked) instead of event's start date
    // This correctly handles multi-day events
    let currentDate;
    if (calendarStore.selectedDate) {
      currentDate = new Date(calendarStore.selectedDate);
    } else if (calendarStore.dayEvents && calendarStore.dayEvents.length > 0) {
      // Fallback: use the first event in dayEvents
      const firstDayEvent = calendarStore.dayEvents[0];
      currentDate = new Date(firstDayEvent.start);
    } else {
      // Last fallback: use selected event's start date
      currentDate = new Date(calendarStore.selectedEvent.start);
    }

    // Start from the next day
    let searchDate = new Date(currentDate);
    searchDate.setDate(searchDate.getDate() + 1);

    // Search up to 30 days ahead for a day with events
    for (let i = 0; i < 30; i++) {
      const eventsForDay = getEventsForDate(searchDate);
      if (eventsForDay.length > 0) {
        // Pass the searchDate so the calendar store knows which day was selected
        // Select the first event of the next day
        calendarStore.selectEvent(eventsForDay[0], searchDate);
        return;
      }
      searchDate.setDate(searchDate.getDate() + 1);
    }
  };

  // Navigate to previous day with events (skips days without events)
  // Always selects the LAST event of the previous day so that subsequent
  // prev presses will browse through that day's events in reverse order
  const navigateToPreviousDayWithEvents = () => {
    if (!calendarStore.selectedEvent) return;

    // Use the selectedDate (the actual day that was clicked) instead of event's start date
    // This correctly handles multi-day events
    let currentDate;
    if (calendarStore.selectedDate) {
      currentDate = new Date(calendarStore.selectedDate);
    } else if (calendarStore.dayEvents && calendarStore.dayEvents.length > 0) {
      // Fallback: use the first event in dayEvents
      const firstDayEvent = calendarStore.dayEvents[0];
      currentDate = new Date(firstDayEvent.start);
    } else {
      // Last fallback: use selected event's start date
      currentDate = new Date(calendarStore.selectedEvent.start);
    }

    // Start from the previous day
    let searchDate = new Date(currentDate);
    searchDate.setDate(searchDate.getDate() - 1);

    // Search up to 30 days back for a day with events
    for (let i = 0; i < 30; i++) {
      const eventsForDay = getEventsForDate(searchDate);
      if (eventsForDay.length > 0) {
        // Pass the searchDate so the calendar store knows which day was selected
        // IMPORTANT: Select the LAST event of the previous day so that subsequent
        // prev presses will browse through that day's events in reverse order
        // (from last to first) before stepping to an earlier day
        calendarStore.selectEvent(eventsForDay[eventsForDay.length - 1], searchDate);
        return;
      }
      searchDate.setDate(searchDate.getDate() - 1);
    }
  };

  // Helper function to adjust day of week based on week start day
  const adjustDayOfWeek = dayOfWeek => {
    // dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
    // weekStartDay: 0=Sunday, 1=Monday, ..., 6=Saturday
    // Return adjusted day where 0 = week start day
    const weekStartDay = configStore.weekStartDay ?? 1;
    return (dayOfWeek - weekStartDay + 7) % 7;
  };

  // Helper function to get date at start of week for a given date
  const getWeekStart = date => {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    const adjustedDay = adjustDayOfWeek(dayOfWeek);
    d.setDate(d.getDate() - adjustedDay);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const handleAction = action => {
    logDebug(
      "[Keyboard]",
      "handleAction called with:",
      action,
      "currentMode:",
      modeStore.currentMode
    );
    // Normalize retired mode_* actions to their current vocabulary first.
    if (Object.prototype.hasOwnProperty.call(LEGACY_ACTION_ALIASES, action)) {
      action = LEGACY_ACTION_ALIASES[action];
    }
    // Handle generic actions that adapt to current mode
    if (action === "generic_next") {
      action = getGenericNextAction();
      logDebug("[Keyboard]", "generic_next resolved to:", action);
    } else if (action === "generic_prev") {
      action = getGenericPrevAction();
      logDebug("[Keyboard]", "generic_prev resolved to:", action);
    } else if (action === "generic_expand_close") {
      action = getGenericExpandCloseAction();
    }

    switch (action) {
      // Screen jump — jump to the first screen containing a region of the given
      // kind. (These were the old mode_* actions; the setMode() calls are
      // vestigial and only survive for parity while modeStore is unwound in
      // calvin-ine.)
      case "screen_jump_calendar":
        if (!activateFirstScreenContainingKind("calendar")) {
          handleCalendarModePress();
        } else {
          modeStore.setMode(modeStore.MODES.CALENDAR);
        }
        break;
      case "screen_jump_photos":
        activateFirstScreenContainingKind("photos");
        modeStore.setMode(modeStore.MODES.PHOTOS);
        router.push("/");
        break;
      case "screen_jump_services":
        activateFirstScreenContainingKind("service");
        modeStore.setMode(modeStore.MODES.WEB_SERVICES);
        router.push("/");
        break;
      case "mode_settings":
        modeStore.setMode(modeStore.MODES.SETTINGS);
        router.push("/settings");
        break;
      case "screen_next":
        saveDashboardScreens(cycleDashboardScreen(getDashboardScreens(), 1));
        router.push("/");
        break;
      case "screen_prev":
        saveDashboardScreens(cycleDashboardScreen(getDashboardScreens(), -1));
        router.push("/");
        break;
      case "screen_1":
      case "screen_2":
      case "screen_3":
      case "screen_4":
      case "screen_5":
      case "screen_6":
      case "screen_7":
        activateScreenByIndex(Number(action.replace("screen_", "")) - 1);
        break;
      case "region_next":
        saveDashboardScreens(cycleActiveDashboardRegion(getDashboardScreens(), 1));
        break;
      case "region_prev":
        saveDashboardScreens(cycleActiveDashboardRegion(getDashboardScreens(), -1));
        break;

      // Calendar actions - context-aware based on view mode
      // Day view: moves by 1 day, Week view: moves by 1 week, Month view: moves by 1 month
      // Note: Navigation preserves the selected event and keeps the modal open
      case "calendar_next":
      case "calendar_next_month": // Legacy name for backward compatibility
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          // Preserve selected event before navigation (modal stays open)
          const preservedEvent = calendarStore.selectedEvent;
          const preservedDate = calendarStore.selectedDate;

          const viewMode = activeCalendarViewMode();
          let newDate;

          if (viewMode === "day") {
            // Day view: move to next day
            newDate = new Date(calendarStore.currentDate);
            newDate.setDate(newDate.getDate() + 1);
          } else if (viewMode === "week") {
            // Week view: move to the start of the next week
            const weekStart = getWeekStart(calendarStore.currentDate);
            weekStart.setDate(weekStart.getDate() + 7);
            newDate = new Date(weekStart);
          } else {
            // Month/Rolling view: move to next month
            newDate = new Date(calendarStore.currentDate);
            newDate.setMonth(newDate.getMonth() + 1);
          }

          // Update current date (triggers calendar rerender)
          // Create a new Date object to ensure Vue detects the change
          calendarStore.setCurrentDate(new Date(newDate));

          // Restore selected event if it was open (keeps modal open)
          // Use nextTick to ensure calendar rerenders first
          if (preservedEvent && preservedDate) {
            nextTick(() => {
              // Re-select the event to ensure it's properly displayed
              // This will update dayEvents if the event is in the new date range,
              // or keep the event visible even if outside the range
              calendarStore.selectEvent(preservedEvent, preservedDate);
            });
          }
        }
        break;
      case "calendar_prev":
      case "calendar_prev_month": // Legacy name for backward compatibility
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          // Preserve selected event before navigation (modal stays open)
          const preservedEvent = calendarStore.selectedEvent;
          const preservedDate = calendarStore.selectedDate;

          const viewMode = activeCalendarViewMode();
          let newDate;

          if (viewMode === "day") {
            // Day view: move to previous day
            newDate = new Date(calendarStore.currentDate);
            newDate.setDate(newDate.getDate() - 1);
          } else if (viewMode === "week") {
            // Week view: move to the start of the previous week
            const weekStart = getWeekStart(calendarStore.currentDate);
            weekStart.setDate(weekStart.getDate() - 7);
            newDate = new Date(weekStart);
          } else {
            // Month/Rolling view: move to previous month
            newDate = new Date(calendarStore.currentDate);
            newDate.setMonth(newDate.getMonth() - 1);
          }

          // Update current date (triggers calendar rerender)
          // Create a new Date object to ensure Vue detects the change
          calendarStore.setCurrentDate(new Date(newDate));

          // Restore selected event if it was open (keeps modal open)
          // Use nextTick to ensure calendar rerenders first
          if (preservedEvent && preservedDate) {
            nextTick(() => {
              // Re-select the event to ensure it's properly displayed
              // This will update dayEvents if the event is in the new date range,
              // or keep the event visible even if outside the range
              calendarStore.selectEvent(preservedEvent, preservedDate);
            });
          }
        }
        break;
      case "calendar_expand":
      case "calendar_expand_today": // Legacy name for backward compatibility
        // Context-aware expand: expands events for current day/week based on view mode
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          const viewMode = activeCalendarViewMode();
          let targetDate = new Date();

          if (viewMode === "day") {
            // Day view: expand events for the currently viewed day
            targetDate = new Date(calendarStore.currentDate);
            targetDate.setHours(0, 0, 0, 0);
          } else if (viewMode === "week") {
            // Week view: expand events for today if it's in the current week,
            // otherwise use the same day of week as today within the viewed week
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const weekStart = getWeekStart(calendarStore.currentDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            if (today >= weekStart && today <= weekEnd) {
              // Today is in the viewed week, use today
              targetDate = today;
            } else {
              // Today is not in the viewed week, use the same day of week as today
              // For example, if today is Wednesday, expand Wednesday of the viewed week
              // Use adjustDayOfWeek to account for week start day setting
              const todayAdjusted = adjustDayOfWeek(today.getDay());
              targetDate = new Date(weekStart);
              targetDate.setDate(weekStart.getDate() + todayAdjusted);
            }
          } else {
            // Month/Rolling view: expand events for today
            targetDate = new Date();
            targetDate.setHours(0, 0, 0, 0);
          }

          // Helper to get calendar date components
          const getDateComponents = date => {
            const d = new Date(date);
            return {
              year: d.getFullYear(),
              month: d.getMonth(),
              day: d.getDate(),
            };
          };

          // Helper to compare date components
          const compareDateComponents = (date1, date2) => {
            if (date1.year !== date2.year) return date1.year - date2.year;
            if (date1.month !== date2.month) return date1.month - date2.month;
            return date1.day - date2.day;
          };

          const targetComponents = getDateComponents(targetDate);

          // Get all events for the target date (including multi-day events that span it)
          const targetEvents = calendarStore.events.filter(event => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);

            if (event.all_day) {
              // All-day events: compare calendar date components
              const eStartComponents = getDateComponents(eventStart);
              const durationMs = eventEnd.getTime() - eventStart.getTime();
              const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
              const eEndDate = new Date(eventStart);
              eEndDate.setDate(eventStart.getDate() + durationDays);
              const eEndComponents = getDateComponents(eEndDate);

              const startCompare = compareDateComponents(eStartComponents, targetComponents);

              const endCompare = compareDateComponents(targetComponents, eEndComponents);
              return startCompare <= 0 && endCompare <= 0;
            } else {
              // Timed events: check if event overlaps with target date
              const eStartComponents = getDateComponents(eventStart);
              const eEndComponents = getDateComponents(eventEnd);

              const startCompare = compareDateComponents(eStartComponents, targetComponents);
              const endCompare = compareDateComponents(targetComponents, eEndComponents);
              return startCompare <= 0 && endCompare <= 0;
            }
          });

          if (targetEvents.length > 0) {
            // Set flag to show all events' details
            calendarStore.setShowAllDayEvents(true);
            // Expand the first event (the panel will show all events' details)
            // Pass target date so it knows which day was selected
            calendarStore.selectEvent(targetEvents[0], targetDate);
          } else {
            // No events for target date - create a placeholder event to open the details view
            // This allows users to navigate to other days even when there are no events
            const placeholderEvent = {
              id: `placeholder-${targetDate.getTime()}`,
              title: "No events",
              start: targetDate.toISOString(),
              end: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(), // End of day
              all_day: true,
              location: null,
              description: null,
              source: null,
            };
            // Set flag to show all events (even though there are none)
            calendarStore.setShowAllDayEvents(true);
            // Select the placeholder event with target date
            calendarStore.selectEvent(placeholderEvent, targetDate);
          }
        }
        break;
      case "calendar_collapse":
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          calendarStore.clearSelectedEvent();
        }
        break;
      case "calendar_next_day":
        // Navigate to next day when event detail panel is open
        if (
          (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) &&
          calendarStore.selectedEvent
        ) {
          navigateToNextDayWithEvents();
        }
        break;
      case "calendar_prev_day":
        // Navigate to previous day when event detail panel is open
        if (
          (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) &&
          calendarStore.selectedEvent
        ) {
          navigateToPreviousDayWithEvents();
        }
        break;
      case "calendar_next_event":
        // Navigate to next event within day, or next day if on last event
        if (
          (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) &&
          calendarStore.selectedEvent
        ) {
          navigateToNextEvent();
        }
        break;
      case "calendar_prev_event":
        // Navigate to previous event within day, or previous day if on first event
        if (
          (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) &&
          calendarStore.selectedEvent
        ) {
          navigateToPreviousEvent();
        }
        break;

      // Image actions
      case "images_next":
        // Works in photos mode or fullscreen photos
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
          modeStore.currentMode === modeStore.MODES.CALENDAR ||
          activeRegionKindIs("photos")
        ) {
          imagesStore.nextImage();
        }
        break;
      case "images_prev":
        // Works in photos mode or fullscreen photos
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
          modeStore.currentMode === modeStore.MODES.CALENDAR ||
          activeRegionKindIs("photos")
        ) {
          imagesStore.previousImage();
        }
        break;
      case "photos_enter_fullscreen":
        // Enter fullscreen photos mode
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          modeStore.currentMode === modeStore.MODES.CALENDAR ||
          activeRegionKindIs("photos")
        ) {
          modeStore.enterFullscreen(modeStore.MODES.PHOTOS);
          router.push("/");
        }
        break;
      case "photos_exit_fullscreen":
        // Exit fullscreen - return to dashboard
        if (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
          modeStore.exitFullscreen();
          router.push("/");
        }
        break;

      case "calendar_enter_fullscreen":
        // Enter fullscreen calendar, carrying the active region's sources so the
        // maximized view shows the same calendars the user was looking at.
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          const region = getActiveRegion();
          const sourceIds =
            region?.kind === "calendar" && Array.isArray(region.instanceIds)
              ? region.instanceIds
              : [];
          const view = region?.kind === "calendar" ? region.view : null;
          modeStore.enterFullscreen(modeStore.MODES.CALENDAR, { sourceIds, view });
          router.push("/");
        }
        break;
      case "calendar_exit_fullscreen":
        // Exit fullscreen - return to dashboard
        if (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.CALENDAR) {
          modeStore.exitFullscreen();
          router.push("/");
        }
        break;

      // Web service actions
      case "web_service_1":
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          // Switch to first web service (index 0)
          webServicesStore.setServiceIndex(0);
        } else {
          modeStore.setMode(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;
      case "web_service_2":
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          // Switch to second web service (index 1)
          webServicesStore.setServiceIndex(1);
        } else {
          modeStore.setMode(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;
      case "web_service_next":
        // Works in web services mode or fullscreen web services
        if (
          modeStore.currentMode === modeStore.MODES.WEB_SERVICES ||
          (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) ||
          activeRegionKindIs("service")
        ) {
          logDebug(
            "[Keyboard]",
            "web_service_next: current index",
            webServicesStore.currentServiceIndex,
            "services count",
            webServicesStore.services.length
          );
          webServicesStore.nextService();
          logDebug(
            "[Keyboard]",
            "web_service_next: new index",
            webServicesStore.currentServiceIndex
          );
        } else {
          // Switch to web services mode (side view)
          modeStore.setMode(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;
      case "web_service_prev":
        // Works in web services mode or fullscreen web services
        if (
          modeStore.currentMode === modeStore.MODES.WEB_SERVICES ||
          (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) ||
          activeRegionKindIs("service")
        ) {
          logDebug(
            "[Keyboard]",
            "web_service_prev: current index",
            webServicesStore.currentServiceIndex,
            "services count",
            webServicesStore.services.length
          );
          webServicesStore.previousService();
          logDebug(
            "[Keyboard]",
            "web_service_prev: new index",
            webServicesStore.currentServiceIndex
          );
        } else {
          // Switch to web services mode (side view)
          modeStore.setMode(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;
      case "web_service_close":
        // Close web services fullscreen - return to dashboard
        if (modeStore.isFullscreen && modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
          modeStore.exitFullscreen();
          router.push("/");
        }
        break;
      case "web_service_enter_fullscreen":
        // Enter fullscreen web services mode, carrying the active region's
        // service so the maximized view shows the service the user pressed
        // expand on — not the globally "current" service (which may belong to a
        // different screen/region). Null context = WEB_SERVICES mode, where
        // fullscreen cycles through all services from the current index.
        if (
          modeStore.currentMode === modeStore.MODES.WEB_SERVICES ||
          activeRegionKindIs("service")
        ) {
          const region = getActiveRegion();
          const serviceId =
            region?.kind === "service" ? region.instanceIds?.[0] || region.serviceId || null : null;
          modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES, serviceId ? { serviceId } : null);
          router.push("/");
        }
        break;

      // Context-aware refresh action
      case "generic_refresh":
        action = getGenericRefreshAction();
        logDebug("[Keyboard]", "generic_refresh resolved to:", action);
      // Fall through to handle the resolved action
      // eslint-disable-next-line no-fallthrough
      case "calendar_refresh":
        if (modeStore.currentMode === modeStore.MODES.CALENDAR || activeRegionKindIs("calendar")) {
          // Refresh calendar events
          calendarStore.refreshEvents().catch(err => {
            logError("[Keyboard]", "Failed to refresh calendar:", err);
          });
          logInfo("[Keyboard]", "Refreshing calendar events");
        }
        break;
      case "service_refresh":
        // Refresh service plugin data (for web services)
        if (
          modeStore.currentMode === modeStore.MODES.WEB_SERVICES ||
          activeRegionKindIs("service")
        ) {
          webServicesStore.refreshCurrentService().catch(err => {
            logError("[Keyboard]", "Failed to refresh service:", err);
          });
          logInfo("[Keyboard]", "Refreshing web service data");
        }
        break;

      case "none":
        // No action
        break;

      default:
        logWarn("[Keyboard]", `Unknown keyboard action: ${action}`);
    }
  };

  // Get the appropriate action for generic_next based on current mode
  const getGenericNextAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen
      ? modeStore.fullscreenMode
      : getModeForActiveRegion() || modeStore.currentMode;

    if (activeMode === modeStore.MODES.CALENDAR) {
      // If event detail panel is open, navigate to next event (within day or next day)
      // Otherwise navigate to next (context-aware: day/week/month based on view mode)
      if (calendarStore.selectedEvent) {
        return "calendar_next_event";
      }
      return "calendar_next";
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return "images_next";
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
      if (getActiveRegion()?.serviceId) return "none";
      return "web_service_next";
    } else {
      return "none"; // No action for other modes
    }
  };

  // Get the appropriate action for generic_prev based on current mode
  const getGenericPrevAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen
      ? modeStore.fullscreenMode
      : getModeForActiveRegion() || modeStore.currentMode;

    if (activeMode === modeStore.MODES.CALENDAR) {
      // If event detail panel is open, navigate to previous event (within day or previous day)
      // Otherwise navigate to previous (context-aware: day/week/month based on view mode)
      if (calendarStore.selectedEvent) {
        return "calendar_prev_event";
      }
      return "calendar_prev";
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return "images_prev";
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
      if (getActiveRegion()?.serviceId) return "none";
      return "web_service_prev";
    } else {
      return "none"; // No action for other modes
    }
  };

  // Get the appropriate action for generic_expand_close based on current mode
  const getGenericExpandCloseAction = () => {
    // Check if we're in fullscreen mode first
    if (modeStore.isFullscreen) {
      if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
        return "photos_exit_fullscreen";
      } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
        return "web_service_close";
      } else if (modeStore.fullscreenMode === modeStore.MODES.CALENDAR) {
        // In fullscreen calendar, an expanded event closes first; otherwise
        // exit fullscreen.
        return calendarStore.selectedEvent ? "calendar_collapse" : "calendar_exit_fullscreen";
      }
    }

    const currentMode = getModeForActiveRegion() || modeStore.currentMode;
    if (currentMode === modeStore.MODES.CALENDAR) {
      // Check if event is expanded - if so, close it; otherwise expand (context-aware)
      if (calendarStore.selectedEvent) {
        return "calendar_collapse";
      } else {
        return "calendar_expand";
      }
    } else if (currentMode === modeStore.MODES.PHOTOS) {
      // Enter fullscreen photos
      return "photos_enter_fullscreen";
    } else if (currentMode === modeStore.MODES.WEB_SERVICES) {
      // Enter fullscreen web services
      return "web_service_enter_fullscreen";
    } else {
      return "none"; // No action for other modes
    }
  };

  // Get the appropriate action for generic_refresh based on current mode
  const getGenericRefreshAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen
      ? modeStore.fullscreenMode
      : getModeForActiveRegion() || modeStore.currentMode;

    if (activeMode === modeStore.MODES.CALENDAR) {
      return "calendar_refresh";
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
      return "service_refresh";
    } else {
      return "none"; // No refresh action for other modes
    }
  };

  const getModeForActiveRegion = () => {
    const kind = getActiveRegion()?.kind;
    if (kind === "calendar") return modeStore.MODES.CALENDAR;
    if (kind === "photos") return modeStore.MODES.PHOTOS;
    if (kind === "service") return modeStore.MODES.WEB_SERVICES;
    return null;
  };

  const focusRegion = regionId => {
    saveDashboardScreens(setActiveDashboardRegion(getDashboardScreens(), regionId));
  };

  const activateScreen = screenId => {
    saveDashboardScreens(setActiveDashboardScreen(getDashboardScreens(), screenId));
    router.push("/");
  };

  return {
    handleAction,
    focusRegion,
    activateScreen,
  };
}
