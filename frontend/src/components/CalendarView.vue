<template>
  <div ref="calendarView" class="calendar-view" tabindex="0" @keydown="handleKeydown">
    <DashboardPanel
      title="Calendar"
      :subtitle="calendarSubtitle"
      :show-title="false"
      :focused="focused"
      :dim="dim"
    >
      <template #actions>
        <button
          v-if="!isTouch"
          class="dashboard-panel__icon-button"
          title="Previous"
          @click="previousMonth"
          @keydown.enter="previousMonth"
        >
          ‹
        </button>
        <button
          v-if="!isTouch"
          class="dashboard-panel__icon-button"
          title="Next"
          @click="nextMonth"
          @keydown.enter="nextMonth"
        >
          ›
        </button>
        <RegionControls v-if="focused" region-kind="calendar" />
      </template>

      <div class="calendar-content">
        <!-- Loading indicator -->
        <div v-if="loading" class="loading-overlay">
          <div class="loading-spinner">
            <div class="spinner" />
            <div class="loading-text">Loading events...</div>
          </div>
        </div>
        <div
          class="calendar-grid"
          :class="{
            'rolling-view': viewMode === 'rolling',
            'week-view': viewMode === 'week',
            'day-view': viewMode === 'day',
            loading: loading,
          }"
        >
          <!-- Day headers -->
          <div class="calendar-weekdays">
            <div
              v-for="day in viewMode === 'day' ? [getCurrentWeekdayName()] : weekDays"
              :key="day"
              class="weekday"
            >
              {{ day }}
            </div>
          </div>
          <!-- Calendar days -->
          <div
            class="calendar-days"
            :class="{
              'rolling-days': viewMode === 'rolling',
            }"
          >
            <div
              v-for="(day, dayIndex) in calendarDays"
              :key="day.date.toISOString()"
              :class="[
                'calendar-day',
                {
                  'other-month': day.otherMonth,
                  today: day.isToday,
                  'week-start': isWeekStart(dayIndex),
                  weekend: isWeekend(day.date),
                  'red-day': showRedDays && isRedDay(day.date),
                },
              ]"
            >
              <div class="day-header">
                <div class="day-number">
                  {{ day.date.getDate() }}
                </div>
                <div v-if="showWeekNumbers && isWeekStart(dayIndex)" class="week-number">
                  {{ getWeekNumberForDay(dayIndex) }}
                </div>
              </div>
              <div class="day-events">
                <!-- Visible events for this day (limited) -->
                <CalendarEventItem
                  v-for="(event, eventIndex) in getVisibleEvents(day.events)"
                  :key="`${event.id}-${day.date.toISOString()}-${eventIndex}`"
                  :ref="el => setEventRef(el, dayIndex, eventIndex)"
                  :event="event"
                  :day-index="dayIndex"
                  :event-index="eventIndex"
                  :day-date="day.date"
                  :is-focused="isFocused(dayIndex, eventIndex)"
                  :is-selected="isEventSelected(event, day.date)"
                  @click="selectEvent"
                  @focus="setFocusedEvent"
                />
                <!-- Overflow indicator -->
                <div
                  v-if="getOverflowCount(day.events) > 0"
                  class="event-overflow-indicator"
                  :title="`${getOverflowCount(day.events)} more event${getOverflowCount(day.events) > 1 ? 's' : ''}`"
                >
                  +{{ getOverflowCount(day.events) }} more
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardPanel>
    <!-- Event Detail Panel -->
    <EventDetailPanel
      v-if="calendarStore.selectedEvent"
      :event="calendarStore.selectedEvent"
      @close="closeEventDetail"
    />
    <DialogScrim v-if="calendarStore.selectedEvent" @dismiss="closeEventDetail" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onActivated, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useCalendarStore } from "../stores/calendar";
import { useConfigStore } from "../stores/config";
import EventDetailPanel from "./EventDetailPanel.vue";
import DialogScrim from "./ui/DialogScrim.vue";
import CalendarEventItem from "./CalendarEventItem.vue";
import DashboardPanel from "./DashboardPanel.vue";
import RegionControls from "./dashboard/RegionControls.vue";
import { useTouchCapability } from "@/composables/useTouchCapability";

const props = defineProps({
  focused: {
    type: Boolean,
    default: false,
  },
  dim: {
    type: Boolean,
    default: false,
  },
  sourceIds: {
    type: Array,
    default: () => [],
  },
});

const { isTouch } = useTouchCapability();

const configStore = useConfigStore();
const sourceKey = computed(() =>
  [
    ...new Set(
      props.sourceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
    ),
  ]
    .sort()
    .join(",")
);
const viewMode = computed(() => configStore.calendarViewMode);
const showWeekNumbers = computed(() => configStore.showWeekNumbers);
const weekStartDay = computed(() => configStore.weekStartDay ?? 1);
const weekendDays = computed(() => configStore.weekendDays || [0, 6]);
const showRedDays = computed(() => configStore.showRedDays || false);

const viewModeLabel = computed(() => {
  const labels = {
    month: "Month",
    week: "Week",
    day: "Day",
    rolling: "Rolling",
  };
  return labels[viewMode.value] || "Month";
});

const calendarSubtitle = computed(() => `${currentMonthYear.value} - ${viewModeLabel.value}`);

const calendarStore = useCalendarStore();
const route = useRoute();

// Reactive today date that updates periodically to refresh the calendar
const today = ref(new Date());
let todayRefreshInterval = null;
let calendarAutoRefreshInterval = null;
let lastLoadedAt = 0;

const calendarRefreshIntervalMinutes = computed(() =>
  Math.max(1, configStore.calendarRefreshInterval || 15)
);

const startCalendarAutoRefresh = () => {
  if (calendarAutoRefreshInterval) clearInterval(calendarAutoRefreshInterval);
  const ms = calendarRefreshIntervalMinutes.value * 60 * 1000;
  calendarAutoRefreshInterval = setInterval(() => loadEvents(true), ms);
};

// Refresh "today" and, on date rollover, advance currentDate if the user is
// viewing the month that just ended. setInterval can fire late after the
// browser/device has been asleep, so this is also called on visibilitychange.
const refreshToday = () => {
  const previousToday = today.value;
  const newToday = new Date();
  const dayChanged =
    previousToday.getFullYear() !== newToday.getFullYear() ||
    previousToday.getMonth() !== newToday.getMonth() ||
    previousToday.getDate() !== newToday.getDate();
  if (!dayChanged) return;
  today.value = newToday;
  const cd = currentDate.value;
  const wasTrackingToday =
    cd.getFullYear() === previousToday.getFullYear() && cd.getMonth() === previousToday.getMonth();
  if (wasTrackingToday) {
    calendarStore.setCurrentDate(newToday);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    refreshToday();
  }
};

// Load calendar sources on mount
onMounted(async () => {
  await calendarStore.fetchSources();

  // Update today's date every minute to refresh the calendar
  // This ensures the "today" highlight updates automatically
  todayRefreshInterval = setInterval(refreshToday, 60000);

  document.addEventListener("visibilitychange", handleVisibilityChange);

  startCalendarAutoRefresh();
});

onUnmounted(() => {
  if (todayRefreshInterval) {
    clearInterval(todayRefreshInterval);
  }
  if (calendarAutoRefreshInterval) {
    clearInterval(calendarAutoRefreshInterval);
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});

watch(calendarRefreshIntervalMinutes, () => {
  startCalendarAutoRefresh();
});

const currentDate = computed(() => calendarStore.currentDate);
const events = computed(() => calendarStore.getEventsForSource(props.sourceIds));
const loading = computed(() => calendarStore.loading);
const selectedEvent = computed(() => calendarStore.selectedEvent);

const calendarView = ref(null);
const focusedDayIndex = ref(null);
const focusedEventIndex = ref(null);
const eventRefs = ref({});

// Week day names
const weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Computed week days based on week start day
const weekDays = computed(() => {
  const startDay = weekStartDay.value;
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(weekDayNames[(startDay + i) % 7]);
  }
  return days;
});

const currentMonthYear = computed(() => {
  if (viewMode.value === "week") {
    // Show week range for week view
    const startDate = getWeekStart(currentDate.value);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // If same month, show: "Jan 1-7, 2024", otherwise "Dec 31 - Jan 6, 2024"
    if (
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear()
    ) {
      return `${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { day: "numeric", year: "numeric" })}`;
    } else {
      const startMonth = startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const endMonth = endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `${startMonth} - ${endMonth}`;
    }
  } else if (viewMode.value === "day") {
    // Show full date for day view
    return currentDate.value.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } else {
    return currentDate.value.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }
});

// Helper function to normalize a date to calendar date (year, month, day only)
// For all-day events: uses UTC methods (since backend sends UTC dates for all-day events)
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

// Helper function to get calendar date components (year, month, day) for direct comparison
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

// Helper function to compare two date components
const compareDateComponents = (date1, date2) => {
  if (date1.year !== date2.year) return date1.year - date2.year;
  if (date1.month !== date2.month) return date1.month - date2.month;
  return date1.day - date2.day;
};

// Helper function to get events for a specific date
const getEventsForDate = date => {
  if (!events.value || events.value.length === 0) return [];

  // Calendar grid date is in local time
  const dateOnly = getCalendarDate(date, false); // false = use local time
  const dateEnd = new Date(dateOnly);
  dateEnd.setHours(23, 59, 59, 999);

  // Get grid date components (local time)
  const gridDateComponents = getDateComponents(date, false);

  return events.value
    .filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // For all-day events, compare calendar date components directly
      // For timed events, check if the date falls within the event's time range
      if (event.all_day) {
        // All-day events: backend sends UTC dates representing calendar dates
        // The start time is at midnight UTC, which represents the calendar date
        // The end time might shift to the next day in some timezones, so we use the start time
        // to determine the calendar date, and calculate the duration from there

        // Extract calendar date from start time (in local timezone)
        const eventStartComponents = getDateComponents(eventStart, false); // Local (auto-converts from UTC)

        // For the end date, we need to calculate it from the start date + duration
        // The backend sends end as the last day at 23:59:59 UTC
        // We calculate the duration in days and add it to the start date
        const durationMs = eventEnd.getTime() - eventStart.getTime();
        const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
        const eventEndDate = new Date(eventStart);
        eventEndDate.setDate(eventStart.getDate() + durationDays);
        const eventEndComponents = getDateComponents(eventEndDate, false); // Local

        // Compare grid date (local) with event dates
        const startCompare = compareDateComponents(eventStartComponents, gridDateComponents);
        const endCompare = compareDateComponents(gridDateComponents, eventEndComponents);

        // Event should show if: gridDate is between eventStart and eventEnd (inclusive)
        return startCompare <= 0 && endCompare <= 0;
      } else {
        // Timed events: check if the date falls within the event's time range
        // Event spans the day if: eventStart <= dateEnd AND eventEnd >= dateOnly
        return eventStart <= dateEnd && eventEnd >= dateOnly;
      }
    })
    .map(event => {
      // Add metadata about event position for styling
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // For all-day events, calculate end date from start date + duration
      // For timed events, use local methods to match calendar grid
      let eventStartComponents, eventEndComponents;
      if (event.all_day) {
        // Extract calendar date from start time (in local timezone)
        eventStartComponents = getDateComponents(eventStart, false); // Local (auto-converts from UTC)

        // Calculate end date from start date + duration
        const durationMs = eventEnd.getTime() - eventStart.getTime();
        const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
        const eventEndDate = new Date(eventStart);
        eventEndDate.setDate(eventStart.getDate() + durationDays);
        eventEndComponents = getDateComponents(eventEndDate, false); // Local
      } else {
        eventStartComponents = getDateComponents(eventStart, false); // Local (auto-converts from UTC)
        eventEndComponents = getDateComponents(eventEnd, false); // Local (auto-converts from UTC)
      }

      // Check if event spans multiple calendar days
      const isMultiDay = compareDateComponents(eventStartComponents, eventEndComponents) !== 0;

      // Check if current date is the start or end day
      const isStart = compareDateComponents(eventStartComponents, gridDateComponents) === 0;
      const isEnd = compareDateComponents(eventEndComponents, gridDateComponents) === 0;

      return {
        ...event,
        _isStart: isStart,
        _isEnd: isEnd,
        _isMultiDay: isMultiDay,
        _isMiddle: isMultiDay && !isStart && !isEnd,
      };
    })
    .sort((a, b) => {
      // First, sort multi-day events before single-day events
      // Multi-day events get priority (return -1 means a comes before b)
      if (a._isMultiDay && !b._isMultiDay) return -1;
      if (!a._isMultiDay && b._isMultiDay) return 1;

      // If both are the same type, sort by start date/time (earlier first)
      const aStart = new Date(a.start).getTime();
      const bStart = new Date(b.start).getTime();
      return aStart - bStart;
    });
};

// Get visible events (limited) for a day
// Note: Overflow limiting only applies to month/rolling views, not week/day views
const getVisibleEvents = events => {
  if (!events || events.length === 0) return [];
  // Don't limit events in week or day view where we have more space
  if (viewMode.value === "week" || viewMode.value === "day") {
    return events;
  }
  const maxVisible = configStore.maxVisibleEvents || 4;
  return events.slice(0, maxVisible);
};

// Get count of overflow events
// Note: Overflow indicator only shows in month/rolling views
const getOverflowCount = events => {
  if (!events || events.length === 0) return 0;
  // Don't show overflow indicator in week or day view
  if (viewMode.value === "week" || viewMode.value === "day") {
    return 0;
  }
  const maxVisible = configStore.maxVisibleEvents || 4;
  return Math.max(0, events.length - maxVisible);
};

// Event helper functions moved to useEventHelpers composable

// Helper function to get week number for a date (ISO 8601 week numbering)
const getWeekNumber = date => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

// Helper function to adjust day of week based on week start day
const adjustDayOfWeek = dayOfWeek => {
  // dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
  // weekStartDay: 0=Sunday, 1=Monday, ..., 6=Saturday
  // Return adjusted day where 0 = week start day
  return (dayOfWeek - weekStartDay.value + 7) % 7;
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

// Helper function to get current weekday name for day view
const getCurrentWeekdayName = () => {
  const dayOfWeek = currentDate.value.getDay();
  return weekDayNames[dayOfWeek];
};

const calendarDays = computed(() => {
  const todayDate = new Date(today.value);
  todayDate.setHours(0, 0, 0, 0);

  if (viewMode.value === "week") {
    // Week view: show 7 days starting from week start of current date
    const days = [];
    const startDate = getWeekStart(currentDate.value);
    startDate.setHours(0, 0, 0, 0);

    // Generate 7 days for the week
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      days.push({
        date,
        otherMonth: false, // In week view, we show all days regardless of month
        isToday: dateOnly.getTime() === todayDate.getTime(),
        events: getEventsForDate(date),
      });
    }

    return days;
  } else if (viewMode.value === "day") {
    // Day view: show only the current day
    const date = new Date(currentDate.value);
    date.setHours(0, 0, 0, 0);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    return [
      {
        date,
        otherMonth: false,
        isToday: dateOnly.getTime() === todayDate.getTime(),
        events: getEventsForDate(date),
      },
    ];
  } else if (viewMode.value === "rolling") {
    // Rolling weeks view: show 4 weeks starting from today
    const days = [];
    const startDate = getWeekStart(todayDate);

    // Generate 4 weeks (28 days)
    for (let i = 0; i < 28; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      days.push({
        date,
        otherMonth: date.getMonth() !== todayDate.getMonth(),
        isToday: dateOnly.getTime() === todayDate.getTime(),
        events: getEventsForDate(date),
      });
    }

    return days;
  } else {
    // Month view: show full month
    const year = currentDate.value.getFullYear();
    const month = currentDate.value.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();
    const adjustedFirstDay = adjustDayOfWeek(firstDayOfWeek);

    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    const lastDate = lastDay.getDate();

    // Days array
    const days = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date,
        otherMonth: true,
        isToday: false,
        events: getEventsForDate(date),
      });
    }

    // Current month days
    const todayDate = new Date(today.value);
    todayDate.setHours(0, 0, 0, 0);

    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day);
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);

      // Ensure current month days are never marked as otherMonth
      const isCurrentMonth = date.getMonth() === month && date.getFullYear() === year;

      days.push({
        date,
        otherMonth: !isCurrentMonth, // Explicitly check month/year
        isToday: dateOnly.getTime() === todayDate.getTime(),
        events: getEventsForDate(date),
      });
    }

    // Next month days (fill to 6 weeks = 42 days)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        otherMonth: true,
        isToday: false,
        events: getEventsForDate(date),
      });
    }

    return days;
  }
});

// Helper function to check if a day is the start of a week
const isWeekStart = dayIndex => {
  // First day of calendar is always a week start
  if (dayIndex === 0) return true;
  // Every 7th day is a week start (based on week start day setting)
  return dayIndex % 7 === 0;
};

// Helper function to get week number for a specific day
const getWeekNumberForDay = dayIndex => {
  if (!showWeekNumbers.value || dayIndex >= calendarDays.value.length) {
    return null;
  }

  const day = calendarDays.value[dayIndex];
  if (!day) return null;

  // Get the first day of the week that contains this date
  const weekStart = getWeekStart(day.date);
  const weekNum = getWeekNumber(weekStart);
  return weekNum;
};

// Helper function to check if a date is a weekend day
const isWeekend = date => {
  const dayOfWeek = date.getDay();
  return weekendDays.value.includes(dayOfWeek);
};

// Helper function to check if a date is a red day (holiday)
// Placeholder: holiday detection deferred until backend supports it
const isRedDay = _date => {
  return false;
};

// Get all events in a flat list for keyboard navigation
const allEvents = computed(() => {
  const flatEvents = [];
  calendarDays.value.forEach((day, dayIndex) => {
    day.events.forEach((event, eventIndex) => {
      flatEvents.push({
        event,
        dayIndex,
        eventIndex,
      });
    });
  });
  return flatEvents;
});

const setEventRef = (el, dayIndex, eventIndex) => {
  if (el) {
    const key = `${dayIndex}-${eventIndex}`;
    eventRefs.value[key] = el;
  }
};

const isFocused = (dayIndex, eventIndex) => {
  return focusedDayIndex.value === dayIndex && focusedEventIndex.value === eventIndex;
};

// Simple function that checks if an event is selected for a specific day
// This function is called in the template, so Vue will track reactive dependencies
const isEventSelected = (event, dayDate) => {
  // Access reactive values - Vue tracks these as dependencies when called in template
  const currentSelectedEvent = selectedEvent.value;
  const currentSelectedDate = calendarStore.selectedDate;

  // Early returns for clarity
  if (!currentSelectedEvent || !event || !currentSelectedDate) {
    return false;
  }

  // Compare IDs - must be exact match (convert to string for safety)
  const selectedId = currentSelectedEvent.id;
  const eventId = event.id;

  // Null/undefined check
  if (selectedId == null || eventId == null) {
    return false;
  }

  // String comparison for robustness
  if (String(selectedId) !== String(eventId)) {
    return false;
  }

  // Only highlight on the selected day (critical for multi-day events)
  // This ensures a multi-day event is only highlighted on the day that was clicked
  const selectedDateComponents = getDateComponents(currentSelectedDate, false);
  const dayDateComponents = getDateComponents(dayDate, false);
  return compareDateComponents(selectedDateComponents, dayDateComponents) === 0;
};

const setFocusedEvent = (dayIndex, eventIndex) => {
  focusedDayIndex.value = dayIndex;
  focusedEventIndex.value = eventIndex;
};

const focusEvent = (dayIndex, eventIndex) => {
  const key = `${dayIndex}-${eventIndex}`;
  const element = eventRefs.value[key];
  if (element && typeof element.focus === "function") {
    element.focus();
  } else if (element && element.$el) {
    // Fallback for component refs
    element.$el.focus();
  }
};

const selectEvent = (event, dayDate) => {
  calendarStore.selectEvent(event, dayDate, props.sourceIds);
};

const closeEventDetail = () => {
  calendarStore.clearSelectedEvent();
  // Return focus to the calendar view
  if (calendarView.value) {
    calendarView.value.focus();
  }
};

const navigateEvents = direction => {
  if (allEvents.value.length === 0) return;

  let currentIndex = -1;
  if (focusedDayIndex.value !== null && focusedEventIndex.value !== null) {
    currentIndex = allEvents.value.findIndex(
      item => item.dayIndex === focusedDayIndex.value && item.eventIndex === focusedEventIndex.value
    );
  }

  let newIndex = currentIndex;
  if (direction === "next") {
    newIndex = currentIndex < allEvents.value.length - 1 ? currentIndex + 1 : 0;
  } else if (direction === "prev") {
    newIndex = currentIndex > 0 ? currentIndex - 1 : allEvents.value.length - 1;
  } else if (direction === "first") {
    newIndex = 0;
  } else if (direction === "last") {
    newIndex = allEvents.value.length - 1;
  }

  if (newIndex >= 0 && newIndex < allEvents.value.length) {
    const target = allEvents.value[newIndex];
    setFocusedEvent(target.dayIndex, target.eventIndex);
    nextTick(() => {
      focusEvent(target.dayIndex, target.eventIndex);
    });
  }
};

const handleKeydown = event => {
  // Don't handle if event detail panel is open (let it handle its own keys)
  if (selectedEvent.value) {
    if (event.key === "Escape") {
      closeEventDetail();
      event.preventDefault();
    }
    return;
  }

  switch (event.key) {
    case "ArrowRight":
      navigateEvents("next");
      event.preventDefault();
      break;
    case "ArrowLeft":
      navigateEvents("prev");
      event.preventDefault();
      break;
    case "Home":
      navigateEvents("first");
      event.preventDefault();
      break;
    case "End":
      navigateEvents("last");
      event.preventDefault();
      break;
    case "Enter":
      // Expand the focused event or all events for the focused day
      if (focusedDayIndex.value !== null) {
        const day = calendarDays.value[focusedDayIndex.value];
        if (day && day.events.length > 0) {
          if (focusedEventIndex.value !== null && focusedEventIndex.value < day.events.length) {
            // Expand the focused event
            selectEvent(day.events[focusedEventIndex.value], day.date);
          } else {
            // Expand the first event of the day
            selectEvent(day.events[0], day.date);
          }
        }
      }
      event.preventDefault();
      break;
    // ArrowUp/ArrowDown/PageUp/PageDown are handled by the generic keyboard binding system
    // via calendar_next/calendar_prev actions which are context-aware (day/week/month based on view mode)
  }
};

// Context-aware navigation: moves by appropriate unit based on view mode
// - Day view: moves by 1 day
// - Week view: moves by 1 week (7 days)
// - Month/Rolling view: moves by 1 month
const navigatePrevious = () => {
  const newDate = new Date(currentDate.value);
  if (viewMode.value === "day") {
    // Day view: move to previous day
    newDate.setDate(newDate.getDate() - 1);
  } else if (viewMode.value === "week") {
    // Week view: move to the start of the previous week
    const weekStart = getWeekStart(currentDate.value);
    weekStart.setDate(weekStart.getDate() - 7);
    newDate.setTime(weekStart.getTime());
  } else {
    // Month/Rolling view: move to previous month
    newDate.setMonth(newDate.getMonth() - 1);
  }
  calendarStore.setCurrentDate(newDate);
  loadEvents();
  // Clear focus when view changes
  focusedDayIndex.value = null;
  focusedEventIndex.value = null;
};

const navigateNext = () => {
  const newDate = new Date(currentDate.value);
  if (viewMode.value === "day") {
    // Day view: move to next day
    newDate.setDate(newDate.getDate() + 1);
  } else if (viewMode.value === "week") {
    // Week view: move to the start of the next week
    const weekStart = getWeekStart(currentDate.value);
    weekStart.setDate(weekStart.getDate() + 7);
    newDate.setTime(weekStart.getTime());
  } else {
    // Month/Rolling view: move to next month
    newDate.setMonth(newDate.getMonth() + 1);
  }
  calendarStore.setCurrentDate(newDate);
  loadEvents();
  // Clear focus when view changes
  focusedDayIndex.value = null;
  focusedEventIndex.value = null;
};

// Legacy function names for backward compatibility (used by header buttons)
const previousMonth = navigatePrevious;
const nextMonth = navigateNext;

const loadEvents = async (background = false) => {
  lastLoadedAt = Date.now();
  let startDate, endDate;
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  if (viewMode.value === "week") {
    // Week view: load the week plus buffer days for multi-day events
    const weekStart = getWeekStart(currentDate.value);
    startDate = new Date(weekStart);
    startDate.setDate(startDate.getDate() - 7); // 7 days before week start
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 14); // 7 days after week end
    endDate.setHours(23, 59, 59, 999);
  } else if (viewMode.value === "day") {
    // Day view: load the day plus buffer days for multi-day events
    const day = new Date(currentDate.value);
    day.setHours(0, 0, 0, 0);
    startDate = new Date(day);
    startDate.setDate(startDate.getDate() - 7); // 7 days before
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(day);
    endDate.setDate(endDate.getDate() + 7); // 7 days after
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Month/rolling view: use month-based range
    // Expand date range to include events that span across month boundaries
    // Load previous month, current month, and next month for better caching
    // This ensures we have data cached for adjacent months
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    startDate = new Date(prevYear, prevMonth, 1);
    startDate.setHours(0, 0, 0, 0);

    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    endDate = new Date(nextYear, nextMonth + 1, 0); // Last day of next month
    endDate.setHours(23, 59, 59, 999);
  }

  try {
    // Don't force refresh on navigation - let the cache handle it
    // Only refresh when explicitly requested (e.g., manual refresh button)
    // The cache TTL (5 minutes) and periodic refresh (15 minutes) will keep data fresh
    const refresh = false;

    await calendarStore.fetchEvents(startDate, endDate, refresh, background, props.sourceIds);
    console.log(
      `Loaded ${calendarStore.events.length} events for ${year}-${month + 1} (range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})`
    );
  } catch (error) {
    console.error("Failed to load events:", error);
  }
};

watch(currentDate, () => {
  loadEvents();
});

watch(sourceKey, () => {
  loadEvents();
});

// Watch for route changes to reload events when navigating back to dashboard
watch(
  () => route.path,
  (newPath, oldPath) => {
    // Reload events when navigating back to dashboard from settings
    if (newPath === "/" && oldPath === "/settings") {
      loadEvents();
      // Also reload sources to ensure they're up to date
      calendarStore.fetchSources();
    }
  },
  { immediate: false }
);

onMounted(() => {
  loadEvents();
  // Focus the calendar view on mount for keyboard navigation
  if (calendarView.value) {
    calendarView.value.focus();
  }
});

// Reload events when component is activated (if using keep-alive).
// Skip if we loaded less than 30 s ago to avoid redundant API calls
// when briefly navigating to settings and back.
const ACTIVATED_DEBOUNCE_MS = 30_000;
onActivated(() => {
  if (route.path === "/") {
    if (Date.now() - lastLoadedAt > ACTIVATED_DEBOUNCE_MS) {
      loadEvents();
    }
    if (calendarStore.sources.length === 0) {
      calendarStore.fetchSources();
    }
  }
});
</script>

<style scoped>
.calendar-view {
  width: 100%;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--calendar-bg);
  border-radius: 8px;
  overflow: visible; /* let the focused panel glow bloom out */
  outline: none;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}

.calendar-view:focus {
  outline: none;
}

.calendar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  /* Force hardware acceleration for consistent rendering on RPI */
  transform: translateZ(0);
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--calendar-bg);
  border-radius: 8px;
  padding: 1rem;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  contain: layout;
}

.calendar-grid.loading {
  opacity: 0.5;
  pointer-events: none;
}

/* Rolling view styles can be added here if needed */

.calendar-weekdays {
  display: grid;
  /* Explicitly set 7 columns with explicit fractions for consistent calculation on RPI */
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr !important;
  /* Use integer pixel gap to prevent fractional rounding issues on RPI */
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  /* Prevent fractional pixel overflow on RPI */
  transform: translateZ(0);
  min-width: 0;
}

.weekday {
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.5rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar-days {
  display: grid;
  /* Explicitly set 7 columns - never allow fewer */
  /* Use explicit fractions to force consistent column width calculation on RPI */
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr !important;
  /* Use integer pixel gap to prevent fractional rounding issues on RPI */
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  overflow-x: clip; /* Prevent negative margins from expanding grid */
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-items: stretch;
  contain: layout;
  /* Prevent fractional pixel overflow on RPI */
  transform: translateZ(0);
  /* Ensure grid fits within container accounting for gaps */
  min-width: 0;
  /* Prevent grid from expanding due to negative margins on events */
  isolation: isolate;
}

/* Week view: taller day cells */
.calendar-grid.week-view .calendar-day {
  min-height: 0;
}

/* Day view: single column, very tall */
.calendar-grid.day-view .calendar-weekdays {
  grid-template-columns: minmax(0, 1fr) !important;
}

.calendar-grid.day-view .calendar-days {
  grid-template-columns: minmax(0, 1fr) !important;
}

.calendar-grid.day-view .calendar-day {
  min-height: 0;
}

.calendar-day {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem;
  min-height: 0;
  min-width: 0;
  max-width: 100%; /* Prevent cell from expanding beyond grid column */
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--calendar-bg) !important;
  transition: background 0.2s;
  position: relative;
  overflow: hidden;
  overflow-x: clip; /* Better clipping for event overflow on RPI */
  /* Prevent negative margins from causing progressive skew */
  isolation: isolate;
  /* Allow content to expand within the cell */
  align-items: stretch;
  box-sizing: border-box;
}

.calendar-day:hover {
  background: var(--bg-secondary) !important;
}

/* Reset any inherited backgrounds - but allow week-number to have its own background */
.calendar-day > *:not(.week-number) {
  background: transparent !important;
}

.calendar-day.other-month {
  opacity: 0.4;
  background: var(--bg-tertiary) !important;
}

/* Force reset background for all calendar days (except other-month and today) */
.calendar-day:not(.other-month):not(.today) {
  background: var(--calendar-bg) !important;
}

.calendar-day.today {
  border: 2px solid var(--accent-primary);
  background: var(--calendar-today-bg) !important;
  opacity: 1 !important;
}

/* Ensure today's day doesn't have other-month styling */
.calendar-day.today.other-month {
  opacity: 1 !important;
  background: var(--calendar-today-bg) !important;
}

/* Ensure current month days don't have grey background */
.calendar-day:not(.other-month) {
  background: var(--calendar-bg) !important;
  opacity: 1 !important;
}

/* Weekend styling - very subtle background tint */
.calendar-day.weekend:not(.other-month) {
  background: rgba(0, 0, 0, 0.02) !important;
}

/* Red day (holiday) styling */
.calendar-day.red-day:not(.other-month) {
  background: rgba(220, 53, 69, 0.1) !important;
}

.calendar-day.red-day:not(.other-month) .day-number {
  color: #dc3545;
  font-weight: 700;
}

/* Ensure day-events container doesn't affect day background */
.calendar-day .day-events {
  background: transparent !important;
}

/* Ensure day-header doesn't affect day background */
.calendar-day .day-header {
  background: transparent !important;
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.25rem;
  flex-shrink: 0;
  min-height: 1.2em;
  min-width: 0;
  width: 100%;
}

.day-number {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  flex-shrink: 0;
  white-space: nowrap;
}

.week-number {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  line-height: 1.2;
  white-space: nowrap;
}

.calendar-day.week-start .week-number {
  color: var(--accent-primary);
  background: var(--calendar-today-bg);
}

.day-events {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: hidden;
  overflow-x: clip; /* Prevent horizontal overflow from event items */
  min-height: 0;
  min-width: 0;
  max-width: 100%; /* Prevent events container from expanding beyond cell */
  width: 100%;
  box-sizing: border-box;
  /* Allow events to expand vertically when space is available */
  align-content: flex-start;
}

.event-overflow-indicator {
  font-size: 0.7rem;
  padding: 0.15rem 0.35rem;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 3px;
  text-align: center;
  cursor: default;
  margin-top: 0.1rem;
  opacity: 0.8;
  font-weight: 500;
  flex-shrink: 0;
}

/* Responsive styles for smaller screens and portrait mode */
/* Use viewport units and scale everything proportionally */
@media (max-width: 768px), (orientation: portrait) {
  .calendar-grid {
    padding: clamp(0.25rem, 1vw, 0.75rem);
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .calendar-weekdays {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.15rem, 0.5vw, 0.5rem);
    margin-bottom: clamp(0.15rem, 0.5vw, 0.5rem);
  }

  .calendar-days {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.15rem, 0.5vw, 0.5rem);
  }

  .calendar-day {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: clamp(0.15rem, 0.75vw, 0.5rem);
  }

  .weekday {
    font-size: clamp(0.6rem, 1.5vw, 0.9rem);
    padding: clamp(0.15rem, 0.5vw, 0.5rem);
  }

  .day-number {
    font-size: clamp(0.7rem, 2vw, 0.9rem);
  }

  .day-header {
    margin-bottom: clamp(0.1rem, 0.5vw, 0.25rem);
  }

  .week-number {
    font-size: clamp(0.55rem, 1.5vw, 0.7rem);
    padding: clamp(0.05rem, 0.25vw, 0.125rem) clamp(0.2rem, 0.5vw, 0.375rem);
  }
}

/* Extra small screens - more aggressive scaling */
@media (max-width: 480px) {
  .calendar-grid {
    padding: clamp(0.15rem, 1vw, 0.5rem);
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .calendar-weekdays {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.1rem, 0.5vw, 0.25rem);
  }

  .weekday {
    font-size: clamp(0.5rem, 2vw, 0.75rem);
    padding: clamp(0.1rem, 0.5vw, 0.25rem);
  }

  .calendar-days {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.1rem, 0.5vw, 0.25rem);
  }

  .calendar-day {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: clamp(0.1rem, 0.75vw, 0.35rem);
  }

  .day-number {
    font-size: clamp(0.6rem, 2.5vw, 0.8rem);
  }
}

/* Portrait mode with limited height - ensure everything fits */
@media (orientation: portrait) and (max-height: 800px) {
  .calendar-grid {
    padding: clamp(0.15rem, 1vh, 0.5rem);
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .calendar-weekdays {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.1rem, 0.5vh, 0.25rem);
    margin-bottom: clamp(0.1rem, 0.5vh, 0.25rem);
  }

  .calendar-days {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: clamp(0.1rem, 0.5vh, 0.25rem);
  }

  .calendar-day {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: clamp(0.1rem, 0.75vh, 0.35rem);
  }

  .weekday {
    font-size: clamp(0.5rem, 2vh, 0.75rem);
    padding: clamp(0.1rem, 0.5vh, 0.25rem);
  }

  .day-number {
    font-size: clamp(0.6rem, 2.5vh, 0.8rem);
  }
}

/* Very small portrait screens - maximum compression */
@media (orientation: portrait) and (max-height: 600px) {
  .calendar-grid {
    padding: 0.15rem;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .calendar-weekdays {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: 0.1rem;
    margin-bottom: 0.1rem;
  }

  .weekday {
    font-size: 0.5rem;
    padding: 0.1rem;
  }

  .calendar-days {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    gap: 0.1rem;
  }

  .calendar-day {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 0.1rem;
  }

  .day-number {
    font-size: 0.6rem;
  }

  .day-events {
    gap: 0.1rem;
  }
}
</style>
