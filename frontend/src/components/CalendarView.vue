<template>
  <div
    ref="calendarView"
    class="calendar-view"
    :class="{ 'calendar-view--fullscreen': isFullscreen }"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <!-- Fullscreen close button (only in fullscreen mode) -->
    <div v-if="isFullscreen" class="fullscreen-close-overlay">
      <button
        class="btn-close-fullscreen"
        data-action="exit-fullscreen"
        title="Close Fullscreen (ESC)"
        @click.stop="handleCloseFullscreen"
      >
        ×
      </button>
    </div>

    <DashboardPanel
      title="Calendar"
      :show-title="false"
      :header-visible="!isFullscreen"
      :focused="focused"
      :dim="dim"
    >
      <template #actions>
        <RegionControls v-if="focused" region-kind="calendar" />
      </template>

      <div class="calendar-content">
        <!-- Always-visible header: month/year label, navigation + view switch -->
        <div class="calendar-header">
          <div class="calendar-header__label">{{ currentMonthYear }}</div>
          <div class="calendar-header__controls">
            <button
              v-if="!isCurrentPeriod"
              type="button"
              class="calendar-header__today"
              title="Jump to today"
              aria-label="Jump to today"
              @click="goToToday"
            >
              Today
            </button>
            <button
              type="button"
              class="calendar-header__nav"
              title="Previous"
              aria-label="Previous"
              @click="previousMonth"
            >
              ‹
            </button>
            <button
              type="button"
              class="calendar-header__view-switch"
              :title="`Switch view (currently ${viewModeLabel})`"
              :aria-label="`Switch calendar view, currently ${viewModeLabel}`"
              @click="cycleView"
            >
              <span class="calendar-header__view-label">{{ viewModeLabel }}</span>
              <span class="calendar-header__view-caret" aria-hidden="true">▸</span>
            </button>
            <button
              type="button"
              class="calendar-header__nav"
              title="Next"
              aria-label="Next"
              @click="nextMonth"
            >
              ›
            </button>
            <CalendarViewOptions
              v-if="view && viewMode !== 'day'"
              :region-id="regionId"
              :view="view"
            />
            <button
              v-if="!isFullscreen"
              type="button"
              class="calendar-header__nav calendar-header__fullscreen"
              title="Fullscreen"
              aria-label="Fullscreen calendar"
              @click="enterFullscreen"
            >
              ⤢
            </button>
          </div>
        </div>

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
            'agenda-view': isAgenda,
            'day-view': viewMode === 'day',
            loading: loading,
          }"
        >
          <!-- Day headers -->
          <div class="calendar-weekdays" :style="rollingColumnStyle">
            <div v-for="header in weekdayHeaders" :key="header.key" class="weekday">
              {{ header.label }}
            </div>
          </div>
          <!-- Calendar days -->
          <div class="calendar-days" :style="rollingColumnStyle">
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
import { useModeStore } from "../stores/mode";
import EventDetailPanel from "./EventDetailPanel.vue";
import DialogScrim from "./ui/DialogScrim.vue";
import CalendarEventItem from "./CalendarEventItem.vue";
import DashboardPanel from "./DashboardPanel.vue";
import RegionControls from "./dashboard/RegionControls.vue";
import CalendarViewOptions from "./dashboard/CalendarViewOptions.vue";

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
  isFullscreen: {
    type: Boolean,
    default: false,
  },
  // Per-region view config: { mode, rolling, weeks, days }. Owns the calendar's
  // base granularity + rolling-window modifier (replaces the old global config).
  view: {
    type: Object,
    default: null,
  },
  // Region id this calendar belongs to — target for view-mutating controls.
  regionId: {
    type: String,
    default: null,
  },
});

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
// Base granularity + rolling modifier come from the region's `view` prop.
const viewMode = computed(() => props.view?.mode ?? "month");
const rolling = computed(() => props.view?.rolling === true);
const showWeekNumbers = computed(() => configStore.showWeekNumbers);
const weekStartDay = computed(() => configStore.weekStartDay ?? 1);
const weekendDays = computed(() => configStore.weekendDays || [0, 6]);
const showRedDays = computed(() => configStore.showRedDays || false);
const rollingWeeks = computed(() => Math.min(12, Math.max(1, props.view?.weeks ?? 4)));
const rollingDays = computed(() => Math.min(14, Math.max(1, props.view?.days ?? 7)));
// Look-ahead weeks appended after a non-rolling month (0 = just the month).
const extraWeeks = computed(() => Math.min(8, Math.max(0, props.view?.extraWeeks ?? 0)));
// Rolling as a windowing modifier: the base view sets the unit + count, and
// rolling only flips the anchor (period-start when off, today when on).
//   month → `weeks` weeks (off: from the month's first week; on: from today's week)
//   week  → `days` days    (off: from the current week's start; on: from today)
//   day   → a single day (no count, no rolling)
const isAgenda = computed(() => viewMode.value === "week");

// First day cell of the rendered window (month + week views).
const windowStart = computed(() => {
  if (viewMode.value === "week") {
    if (rolling.value) {
      const d = new Date(currentDate.value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return getWeekStart(currentDate.value);
  }
  const anchor = rolling.value
    ? currentDate.value
    : new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), 1);
  return getWeekStart(anchor);
});

// Weeks needed to render the anchor month in full — leading days from the
// previous month plus trailing days to complete the last week (4–6 weeks
// depending on the month). Non-rolling month always shows all of these, so no
// day is ever hidden by the count.
const monthGridWeeks = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  const start = getWeekStart(new Date(y, m, 1));
  const lastOfMonth = new Date(y, m + 1, 0);
  const span = Math.round((lastOfMonth - start) / 86400000) + 1;
  return Math.ceil(span / 7);
});

// Number of day cells in the window (day view is handled separately).
//   week          → `days` cells
//   rolling month → `weeks` cells (a pure N-week window from today's week)
//   non-rolling month → the full month grid + `extraWeeks` look-ahead weeks
const windowLength = computed(() => {
  if (viewMode.value === "week") return rollingDays.value;
  if (viewMode.value === "month" && !rolling.value) {
    return (monthGridWeeks.value + extraWeeks.value) * 7;
  }
  return rollingWeeks.value * 7;
});

// The agenda strip lays out `days` columns in one row; the count is dynamic, so
// feed it to the (!important) grid rule via a custom property.
const rollingColumnStyle = computed(() =>
  isAgenda.value ? { "--rolling-cols": `repeat(${rollingDays.value}, minmax(0, 1fr))` } : null
);

const viewModeLabel = computed(() => {
  const labels = { month: "Month", week: "Week", day: "Day" };
  const base = labels[viewMode.value] || "Month";
  return rolling.value && viewMode.value !== "day" ? `${base} · Rolling` : base;
});

const calendarStore = useCalendarStore();
const modeStore = useModeStore();
const route = useRoute();

// Cycle this region's base view (month → week → day) and persist it to the
// region. Rolling stays out of the cycle — it's a separate windowing toggle.
const cycleView = () => {
  const order = ["month", "week", "day"];
  const next = order[(order.indexOf(viewMode.value) + 1) % order.length];
  configStore.updateRegionView(props.regionId, { mode: next }).catch(err => {
    console.error("Failed to cycle calendar view mode:", err);
  });
};

// True when the visible window already contains today — used to hide the
// "Today" jump button when it would be a no-op.
const isCurrentPeriod = computed(() => {
  const t = new Date(today.value);
  t.setHours(0, 0, 0, 0);
  const cd = currentDate.value;
  if (viewMode.value === "day") {
    return (
      cd.getFullYear() === t.getFullYear() &&
      cd.getMonth() === t.getMonth() &&
      cd.getDate() === t.getDate()
    );
  }
  // Month and week are both day-windows: today is "current" when it falls in
  // the rendered [windowStart, windowStart + windowLength) span.
  const start = new Date(windowStart.value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + windowLength.value - 1);
  return t >= start && t <= end;
});

const goToToday = () => {
  calendarStore.setCurrentDate(new Date());
  focusedDayIndex.value = null;
  focusedEventIndex.value = null;
};

const handleCloseFullscreen = () => {
  modeStore.exitFullscreen();
};

const enterFullscreen = () => {
  // Carry the region's sources and view so the maximized calendar matches.
  modeStore.enterFullscreen(modeStore.MODES.CALENDAR, {
    sourceIds: props.sourceIds,
    view: props.view,
  });
};

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

// Column headers for the grid. Fixed weekday names for month; a single weekday
// for day view; per-day date labels ("Wed 2") for the week agenda strip, since
// a variable day count breaks fixed weekday columns.
const weekdayHeaders = computed(() => {
  if (viewMode.value === "day") {
    return [{ key: "day", label: getCurrentWeekdayName() }];
  }
  if (isAgenda.value) {
    return calendarDays.value.map(d => ({
      key: d.date.toISOString(),
      label: `${weekDayNames[d.date.getDay()]} ${d.date.getDate()}`,
    }));
  }
  return weekDays.value.map(name => ({ key: name, label: name }));
});

// Format an inclusive start–end date range: "Jan 1 - 7, 2024" when the range
// stays inside one month, otherwise "Dec 31 - Jan 6, 2025".
const formatDateRange = (startDate, endDate) => {
  if (
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear()
  ) {
    return `${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { day: "numeric", year: "numeric" })}`;
  }
  const start = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} - ${end}`;
};

const currentMonthYear = computed(() => {
  if (viewMode.value === "day") {
    // Show full date for day view
    return currentDate.value.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  // Non-rolling month is anchored to one calendar month, so name it plainly
  // ("July 2026"); the leading/trailing padding days are dimmed rather than
  // spelled out in the header.
  if (viewMode.value === "month" && !rolling.value) {
    return currentDate.value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  // Rolling month and week are count-driven windows with no single "month";
  // label them with the inclusive range they actually span.
  const startDate = new Date(windowStart.value);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + windowLength.value - 1);
  return formatDateRange(startDate, endDate);
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

  if (viewMode.value === "day") {
    const dayDate = new Date(currentDate.value);
    dayDate.setHours(0, 0, 0, 0);
    return [
      {
        date: dayDate,
        otherMonth: false,
        isToday: dayDate.getTime() === todayDate.getTime(),
        events: getEventsForDate(dayDate),
      },
    ];
  }

  // Month and week are both windows of consecutive days beginning at
  // windowStart (rolling only shifts the anchor). For a non-rolling month the
  // window is anchored to one calendar month, so the leading/trailing padding
  // days are flagged `otherMonth` and dimmed. Rolling month and week are pure
  // windows — the window IS the view, so nothing is greyed.
  const dimOutOfMonth = viewMode.value === "month" && !rolling.value;
  const anchorMonth = currentDate.value.getMonth();
  const anchorYear = currentDate.value.getFullYear();

  const windowDays = [];
  const windowFirst = new Date(windowStart.value);
  windowFirst.setHours(0, 0, 0, 0);
  for (let i = 0; i < windowLength.value; i++) {
    const date = new Date(windowFirst);
    date.setDate(windowFirst.getDate() + i);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    const otherMonth =
      dimOutOfMonth && (date.getMonth() !== anchorMonth || date.getFullYear() !== anchorYear);
    windowDays.push({
      date,
      otherMonth,
      isToday: dateOnly.getTime() === todayDate.getTime(),
      events: getEventsForDate(date),
    });
  }
  return windowDays;
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

  // In fullscreen, Escape returns to the dashboard
  if (event.key === "Escape" && props.isFullscreen) {
    handleCloseFullscreen();
    event.preventDefault();
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
    // Week agenda strip: page back by the window's own length
    newDate.setDate(newDate.getDate() - rollingDays.value);
  } else if (rolling.value) {
    // Rolling month: roll the multi-week window back by one week
    const weekStart = getWeekStart(currentDate.value);
    weekStart.setDate(weekStart.getDate() - 7);
    newDate.setTime(weekStart.getTime());
  } else {
    // Month view: move to previous month
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
    // Week agenda strip: page forward by the window's own length
    newDate.setDate(newDate.getDate() + rollingDays.value);
  } else if (rolling.value) {
    // Rolling month: roll the multi-week window forward by one week
    const weekStart = getWeekStart(currentDate.value);
    weekStart.setDate(weekStart.getDate() + 7);
    newDate.setTime(weekStart.getTime());
  } else {
    // Month view: move to next month
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

  if (viewMode.value === "day") {
    // Day view: load the day plus a buffer week on each side for multi-day events
    const day = new Date(currentDate.value);
    day.setHours(0, 0, 0, 0);
    startDate = new Date(day);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(day);
    endDate.setDate(endDate.getDate() + 7);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Month and week are both day-windows: fetch [windowStart, +windowLength)
    // plus a buffer week on each side so multi-day events that start/end just
    // outside the window still render. This scales with any week/day count.
    const first = new Date(windowStart.value);
    first.setHours(0, 0, 0, 0);
    startDate = new Date(first);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(first);
    endDate.setDate(endDate.getDate() + windowLength.value + 6);
    endDate.setHours(23, 59, 59, 999);
  }

  try {
    // Don't force refresh on navigation - let the cache handle it
    // Only refresh when explicitly requested (e.g., manual refresh button)
    // The cache TTL (5 minutes) and periodic refresh (15 minutes) will keep data fresh
    const refresh = false;

    await calendarStore.fetchEvents(startDate, endDate, refresh, background, props.sourceIds);
    console.log(
      `Loaded ${calendarStore.events.length} events (range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})`
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

// The visible date range differs per view mode (a month spans wider than the
// ±7-day week/day window), so refetch when the mode changes and drop any stale
// event focus.
watch(viewMode, () => {
  focusedDayIndex.value = null;
  focusedEventIndex.value = null;
  loadEvents();
});

// A larger window needs a wider fetch range than what's already loaded. Weeks
// drive month view; days drive the week agenda strip.
watch(rollingWeeks, () => {
  if (viewMode.value === "month") loadEvents();
});

watch(rollingDays, () => {
  if (viewMode.value === "week") loadEvents();
});

// Appending look-ahead weeks widens a non-rolling month's fetch range.
watch(extraWeeks, () => {
  if (viewMode.value === "month" && !rolling.value) loadEvents();
});

// Rolling on/off (and base mode) can flip the effective window; reload so the
// fetched range matches what's rendered.
watch(rolling, () => loadEvents());

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

.calendar-view--fullscreen {
  border-radius: 0;
}

/* Keep the header controls clear of the fixed fullscreen close (×) button,
   which floats at top/right: 1rem and is 48px wide. */
.calendar-view--fullscreen .calendar-header {
  padding-right: 4rem;
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

/* Always-visible calendar header: month/year label + nav + view switch.
   Lives inside the content (not the panel chrome) so it stays visible even
   when the dashboard UI chrome is hidden. */
.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
  padding: 0 0.25rem 0.4rem;
  min-width: 0;
}

.calendar-header__label {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.calendar-header__controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.calendar-header__nav {
  min-width: 1.75rem;
  height: 1.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-family: var(--font-ui);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.calendar-header__view-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 1.75rem;
  padding: 0 0.7rem;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.calendar-header__today {
  height: 1.75rem;
  padding: 0 0.75rem;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 1px solid var(--focus);
  border-radius: 8px;
  cursor: pointer;
  transition: filter 0.2s;
}

.calendar-header__today:hover {
  filter: brightness(1.08);
}

.calendar-header__today:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.calendar-header__view-caret {
  font-size: 0.7rem;
  color: var(--ink-2);
}

.calendar-header__nav:hover,
.calendar-header__view-switch:hover {
  border-color: var(--focus-edge);
}

.calendar-header__nav:focus-visible,
.calendar-header__view-switch:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Fullscreen close button — mirrors the photos/web-service overlay. */
.fullscreen-close-overlay {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  pointer-events: none;
}

.btn-close-fullscreen {
  background: var(--bg-2);
  color: var(--ink);
  border: 2px solid var(--line);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  pointer-events: auto;
  box-shadow: 0 4px 12px var(--shadow);
}

.btn-close-fullscreen:hover {
  background: var(--bg-1);
  border-color: var(--ink-2);
  transform: scale(1.1);
}

.btn-close-fullscreen:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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

/* Week agenda: a strip of N day columns in a single row. The count is dynamic,
   so it comes in via the --rolling-cols custom property (set inline). */
.calendar-grid.agenda-view .calendar-weekdays,
.calendar-grid.agenda-view .calendar-days {
  grid-template-columns: var(--rolling-cols) !important;
  grid-auto-rows: minmax(0, 1fr);
}

.calendar-grid.agenda-view .calendar-day {
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

/* Leading/trailing padding days of a non-rolling month. No grey block — they
   belong to the adjacent month, so they just recede and let the current month
   lift out of the grid. */
.calendar-day.other-month {
  opacity: 0.38;
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
  font-family: var(--font-data);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--focus);
  background: color-mix(in srgb, var(--focus) 12%, transparent);
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  line-height: 1.35;
  white-space: nowrap;
  align-self: flex-start;
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
