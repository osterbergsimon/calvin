import { useModeStore } from "../stores/mode";
import { useCalendarStore } from "../stores/calendar";
import { useImagesStore } from "../stores/images";
import { useWebServicesStore } from "../stores/webServices";
import { useConfigStore } from "../stores/config";
import { useRouter } from "vue-router";

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

    // We're already in calendar mode - cycle to next view mode
    if (typeof configStore.cycleCalendarViewMode === 'function') {
      configStore.cycleCalendarViewMode().then((newMode) => {
        console.log(`Calendar view mode cycled to: ${newMode}`);
      }).catch((err) => {
        console.error("Failed to cycle calendar view mode:", err);
      });
    } else {
      // Fallback: manually cycle if function doesn't exist (hot-reload issue)
      const modes = ["month", "week", "day"];
      const currentIndex = modes.indexOf(configStore.calendarViewMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const newMode = modes[nextIndex];
      configStore.setCalendarViewMode(newMode);
      // Try to persist to backend
      if (typeof configStore.updateConfig === 'function') {
        configStore.updateConfig({ calendarViewMode: newMode }).catch((err) => {
          console.error("Failed to save calendar view mode:", err);
        });
      }
      console.log(`Calendar view mode cycled to: ${newMode} (fallback)`);
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

  // Helper to get events for a specific date (handles multi-day events)
  const getEventsForDate = (date) => {
    if (!calendarStore.events || calendarStore.events.length === 0) return [];
    
    const dateComponents = getDateComponents(date, false);
    
    return calendarStore.events.filter((event) => {
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

        const startCompare = compareDateComponents(
          eStartComponents,
          dateComponents,
        );
        const endCompare = compareDateComponents(
          dateComponents,
          eEndComponents,
        );
        return startCompare <= 0 && endCompare <= 0;
      } else {
        // Timed events: check if event overlaps with the date
        const eStartComponents = getDateComponents(eventStart, false);
        const eEndComponents = getDateComponents(eventEnd, false);

        const startCompare = compareDateComponents(
          eStartComponents,
          dateComponents,
        );
        const endCompare = compareDateComponents(
          dateComponents,
          eEndComponents,
        );
        return startCompare <= 0 && endCompare <= 0;
      }
    });
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
        calendarStore.selectEvent(eventsForDay[0], searchDate);
        return;
      }
      searchDate.setDate(searchDate.getDate() + 1);
    }
  };

  // Navigate to previous day with events (skips days without events)
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
        calendarStore.selectEvent(eventsForDay[0], searchDate);
        return;
      }
      searchDate.setDate(searchDate.getDate() - 1);
    }
  };

  const handleAction = (action) => {
    console.log("[Keyboard] handleAction called with:", action, "currentMode:", modeStore.currentMode);
    // Handle generic actions that adapt to current mode
    if (action === "generic_next") {
      action = getGenericNextAction();
      console.log("[Keyboard] generic_next resolved to:", action);
    } else if (action === "generic_prev") {
      action = getGenericPrevAction();
      console.log("[Keyboard] generic_prev resolved to:", action);
    } else if (action === "generic_expand_close") {
      action = getGenericExpandCloseAction();
    }

    switch (action) {
      // Mode switching
      case "mode_calendar":
        handleCalendarModePress();
        break;
      case "mode_photos":
        modeStore.setMode(modeStore.MODES.PHOTOS);
        router.push("/");
        break;
      case "mode_web_services":
        modeStore.setMode(modeStore.MODES.WEB_SERVICES);
        router.push("/");
        break;
      case "mode_spare":
        // Spare button for future use - currently does nothing
        // Can be mapped to any action later
        break;
      case "mode_settings":
        modeStore.setMode(modeStore.MODES.SETTINGS);
        router.push("/settings");
        break;
      case "mode_cycle":
        modeStore.cycleMode();
        if (modeStore.currentMode === modeStore.MODES.SETTINGS) {
          router.push("/settings");
        } else {
          router.push("/");
        }
        break;

      // Calendar actions
      case "calendar_next_month":
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const newDate = new Date(calendarStore.currentDate);
          newDate.setMonth(newDate.getMonth() + 1);
          calendarStore.setCurrentDate(newDate);
        }
        break;
      case "calendar_prev_month":
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const newDate = new Date(calendarStore.currentDate);
          newDate.setMonth(newDate.getMonth() - 1);
          calendarStore.setCurrentDate(newDate);
        }
        break;
      case "calendar_expand_today":
        // Expand all events for today - show all details for all events
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Helper to get calendar date components
          const getDateComponents = (date) => {
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

          const todayComponents = getDateComponents(today);

          // Get all events for today (including multi-day events that span today)
          const todayEvents = calendarStore.events.filter((event) => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);

            if (event.all_day) {
              // All-day events: compare calendar date components
              const eStartComponents = getDateComponents(eventStart);
              const durationMs = eventEnd.getTime() - eventStart.getTime();
              const durationDays = Math.floor(
                durationMs / (1000 * 60 * 60 * 24),
              );
              const eEndDate = new Date(eventStart);
              eEndDate.setDate(eventStart.getDate() + durationDays);
              const eEndComponents = getDateComponents(eEndDate);

              const startCompare = compareDateComponents(
                eStartComponents,
                todayComponents,
              );

              const endCompare = compareDateComponents(
                todayComponents,
                eEndComponents,
              );
              return startCompare <= 0 && endCompare <= 0;
            } else {
              // Timed events: check if event overlaps with today
              const eStartComponents = getDateComponents(eventStart);
              const eEndComponents = getDateComponents(eventEnd);

              const startCompare = compareDateComponents(
                eStartComponents,
                todayComponents,
              );
              const endCompare = compareDateComponents(
                todayComponents,
                eEndComponents,
              );
              return startCompare <= 0 && endCompare <= 0;
            }
          });

          if (todayEvents.length > 0) {
            // Set flag to show all events' details
            calendarStore.setShowAllDayEvents(true);
            // Expand the first event (the panel will show all events' details)
            // Pass today's date so it knows which day was selected
            calendarStore.selectEvent(todayEvents[0], today);
          }
        }
        break;
      case "calendar_collapse":
        if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
          calendarStore.clearSelectedEvent();
        }
        break;
      case "calendar_next_day":
        // Navigate to next day when event detail panel is open
        if (modeStore.currentMode === modeStore.MODES.CALENDAR && calendarStore.selectedEvent) {
          navigateToNextDayWithEvents();
        }
        break;
      case "calendar_prev_day":
        // Navigate to previous day when event detail panel is open
        if (modeStore.currentMode === modeStore.MODES.CALENDAR && calendarStore.selectedEvent) {
          navigateToPreviousDayWithEvents();
        }
        break;

      // Image actions
      case "images_next":
        // Works in photos mode or fullscreen photos
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          (modeStore.isFullscreen &&
            modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
          modeStore.currentMode === modeStore.MODES.CALENDAR
        ) {
          imagesStore.nextImage();
        }
        break;
      case "images_prev":
        // Works in photos mode or fullscreen photos
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          (modeStore.isFullscreen &&
            modeStore.fullscreenMode === modeStore.MODES.PHOTOS) ||
          modeStore.currentMode === modeStore.MODES.CALENDAR
        ) {
          imagesStore.previousImage();
        }
        break;
      case "photos_enter_fullscreen":
        // Enter fullscreen photos mode
        if (
          modeStore.currentMode === modeStore.MODES.PHOTOS ||
          modeStore.currentMode === modeStore.MODES.CALENDAR
        ) {
          modeStore.enterFullscreen(modeStore.MODES.PHOTOS);
          router.push("/");
        }
        break;
      case "photos_exit_fullscreen":
        // Exit fullscreen - return to dashboard
        if (
          modeStore.isFullscreen &&
          modeStore.fullscreenMode === modeStore.MODES.PHOTOS
        ) {
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
          (modeStore.isFullscreen &&
            modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES)
        ) {
          console.log("[Keyboard] web_service_next: current index", webServicesStore.currentServiceIndex, "services count", webServicesStore.services.length);
          webServicesStore.nextService();
          console.log("[Keyboard] web_service_next: new index", webServicesStore.currentServiceIndex);
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
          (modeStore.isFullscreen &&
            modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES)
        ) {
          console.log("[Keyboard] web_service_prev: current index", webServicesStore.currentServiceIndex, "services count", webServicesStore.services.length);
          webServicesStore.previousService();
          console.log("[Keyboard] web_service_prev: new index", webServicesStore.currentServiceIndex);
        } else {
          // Switch to web services mode (side view)
          modeStore.setMode(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;
      case "web_service_close":
        // Close web services fullscreen - return to dashboard
        if (
          modeStore.isFullscreen &&
          modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES
        ) {
          modeStore.exitFullscreen();
          router.push("/");
        }
        break;
      case "web_service_enter_fullscreen":
        // Enter fullscreen web services mode
        if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
          modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES);
          router.push("/");
        }
        break;

      case "none":
        // No action
        break;

      default:
        console.warn(`Unknown keyboard action: ${action}`);
    }
  };

  // Get the appropriate action for generic_next based on current mode
  const getGenericNextAction = () => {
    // If in fullscreen, use fullscreen mode; otherwise use current mode
    const activeMode = modeStore.isFullscreen
      ? modeStore.fullscreenMode
      : modeStore.currentMode;

    if (activeMode === modeStore.MODES.CALENDAR) {
      // If event detail panel is open, navigate to next day; otherwise next month
      if (calendarStore.selectedEvent) {
        return "calendar_next_day";
      }
      return "calendar_next_month";
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return "images_next";
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
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
      : modeStore.currentMode;

    if (activeMode === modeStore.MODES.CALENDAR) {
      // If event detail panel is open, navigate to previous day; otherwise previous month
      if (calendarStore.selectedEvent) {
        return "calendar_prev_day";
      }
      return "calendar_prev_month";
    } else if (activeMode === modeStore.MODES.PHOTOS) {
      return "images_prev";
    } else if (activeMode === modeStore.MODES.WEB_SERVICES) {
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
      }
    }

    const currentMode = modeStore.currentMode;
    if (currentMode === modeStore.MODES.CALENDAR) {
      // Check if event is expanded - if so, close it; otherwise expand today
      if (calendarStore.selectedEvent) {
        return "calendar_collapse";
      } else {
        return "calendar_expand_today";
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

  return {
    handleAction,
  };
}
