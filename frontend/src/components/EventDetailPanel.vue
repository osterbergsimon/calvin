<template>
  <div
    v-if="event"
    class="event-detail-panel"
    :style="{ '--event-hue': eventColor }"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <span class="event-detail__spine" aria-hidden="true"></span>

    <div class="event-detail__body">
      <header class="event-detail__head">
        <div class="event-detail__heading">
          <h3 class="event-detail__title">{{ event.title }}</h3>
          <div class="event-detail__calendar">
            <span class="event-detail__dot" aria-hidden="true"></span>
            <span>{{ getSourceName(event.source) }}</span>
            <template v-if="event.all_day && !isMultiDay">
              <span class="event-detail__sep" aria-hidden="true">·</span>
              <span class="event-detail__tag">all day</span>
            </template>
          </div>
        </div>
        <IconButton variant="ghost" label="Close" @click="close">×</IconButton>
      </header>

      <!-- WHEN — the timetable hero -->
      <template v-if="isMultiDay">
        <div class="event-detail__range">
          <div class="event-detail__range-end">
            <span class="event-detail__range-label">from</span>
            <span class="event-detail__range-date">{{ formatRangeDay(event.start) }}</span>
          </div>
          <span class="event-detail__range-line" aria-hidden="true"></span>
          <div class="event-detail__range-end event-detail__range-end--to">
            <span class="event-detail__range-label">to</span>
            <span class="event-detail__range-date">{{ formatRangeDay(displayEnd) }}</span>
          </div>
        </div>
        <div class="event-detail__subwhen">
          <span class="event-detail__tag">{{ durationLabel }}</span>
          <template v-if="!event.all_day">
            <span class="event-detail__sep" aria-hidden="true">·</span>
            <span>{{ formatTime(event.start) }} – {{ formatTime(event.end) }}</span>
          </template>
        </div>
      </template>
      <template v-else>
        <div class="event-detail__when">
          <span v-if="!event.all_day" class="event-detail__time">
            {{ formatTime(event.start) }}–{{ formatTime(event.end) }}
          </span>
          <span v-else class="event-detail__time">All day</span>
          <span v-if="durationLabel" class="event-detail__tag">{{ durationLabel }}</span>
        </div>
        <div class="event-detail__subwhen">{{ formatFullDay(selectedDate || event.start) }}</div>
      </template>

      <!-- Location -->
      <div v-if="event.location" class="event-detail__where">
        <svg
          class="event-detail__where-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
        <span>{{ event.location }}</span>
      </div>

      <!-- Description -->
      <p v-if="event.description" class="event-detail__desc">{{ event.description }}</p>

      <!-- The day's other events -->
      <div v-if="otherEvents.length" class="event-detail__also">
        <div class="event-detail__also-label">
          Also on {{ formatRangeDay(selectedDate || event.start) }}
        </div>
        <button
          v-for="dayEvent in otherEvents"
          :key="dayEvent.id"
          type="button"
          class="event-detail__also-item"
          @click="selectEvent(dayEvent)"
        >
          <span class="event-detail__also-time">{{
            dayEvent.all_day ? "All day" : formatTime(dayEvent.start)
          }}</span>
          <span
            class="event-detail__also-dot"
            :style="{ backgroundColor: getEventColor(dayEvent) }"
            aria-hidden="true"
          ></span>
          <span class="event-detail__also-name">{{ dayEvent.title }}</span>
        </button>
      </div>
      <p v-else-if="showAllDayEvents" class="event-detail__empty">Nothing else scheduled.</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import { useConfigStore } from "../stores/config";
import { useCalendarStore } from "../stores/calendar";
import { useEventHelpers } from "../composables/useEventHelpers";

const props = defineProps({
  event: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close"]);
const configStore = useConfigStore();
const calendarStore = useCalendarStore();
const { getEventColor } = useEventHelpers();

const dayEvents = computed(() => calendarStore.dayEvents);
const showAllDayEvents = computed(() => calendarStore.showAllDayEvents);
const selectedDate = computed(() => calendarStore.selectedDate);

const eventColor = computed(() => (props.event ? getEventColor(props.event) : "var(--focus)"));

// The other events sharing this day — the footer, de-emphasised so the tapped
// event stays the hero.
const otherEvents = computed(() =>
  dayEvents.value.filter(e => String(e.id) !== String(props.event?.id))
);

const close = () => emit("close");

// Arrow keys are handled by the global keyboard mapping system; only Escape here.
const handleKeydown = e => {
  if (e.key === "Escape") {
    close();
    e.preventDefault();
  }
};

const selectEvent = event => {
  calendarStore.selectEvent(event);
};

const isMultiDay = computed(() => {
  if (!props.event) return false;
  const start = new Date(props.event.start);
  const end = new Date(props.event.end);
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
});

// The last calendar day the event covers. All-day events arrive with an end at
// the next midnight (UTC), so derive the true end from the day-count instead of
// showing a day too many.
const displayEnd = computed(() => {
  if (!props.event) return null;
  const start = new Date(props.event.start);
  const end = new Date(props.event.end);
  if (props.event.all_day) {
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000);
    const d = new Date(start);
    d.setDate(start.getDate() + days);
    return d;
  }
  return end;
});

const durationLabel = computed(() => {
  if (!props.event) return "";
  const start = new Date(props.event.start);
  if (isMultiDay.value || props.event.all_day) {
    const end = displayEnd.value;
    const days = Math.round((stripTime(end) - stripTime(start)) / 86400000) + 1;
    return days > 1 ? `${days} days` : "";
  }
  const mins = Math.round((new Date(props.event.end) - start) / 60000);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
});

const stripTime = date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatTime = dateString => {
  const date = new Date(dateString);
  const timeFormat = configStore.timeFormat || "24h";
  const timeOptions =
    timeFormat === "24h"
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour: "numeric", minute: "2-digit", hour12: true };
  return date.toLocaleTimeString("en-US", timeOptions);
};

// "Wed 15 Jul 2026" — the single-day sub-line.
const formatFullDay = dateString =>
  new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// "Mon 13 Jul" — compact, for ranges and the footer label.
const formatRangeDay = dateString =>
  new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const getSourceName = sourceId => {
  if (!sourceId) return "Calendar";
  const source = calendarStore.sources.find(s => s.id === sourceId);
  return source?.name || sourceId;
};
</script>

<style scoped>
.event-detail-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  display: flex;
  min-width: 400px;
  max-width: 460px;
  max-height: 80vh;
  overflow: hidden;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px var(--shadow, rgba(0, 0, 0, 0.5));
  outline: none;
}

/* The event's own colour runs down the left edge — the same identity cue as the
   calendar ribbons, so the panel visibly belongs to what you tapped. */
.event-detail__spine {
  flex: none;
  width: 5px;
  background: var(--event-hue);
}

.event-detail__body {
  flex: 1;
  min-width: 0;
  padding: 1.25rem 1.4rem;
  overflow-y: auto;
}

.event-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.event-detail__heading {
  min-width: 0;
}

.event-detail__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.event-detail__calendar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.5rem;
  font-family: var(--font-data);
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  color: var(--ink-2);
}

.event-detail__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--event-hue);
  flex: none;
}

.event-detail__sep {
  color: var(--ink-3);
}

.event-detail__tag {
  font-family: var(--font-data);
  font-size: 0.62rem;
  letter-spacing: 0.03em;
  color: var(--ink-3);
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 0.1rem 0.45rem;
}

/* When — single day */
.event-detail__when {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.1rem;
}

.event-detail__time {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 1.7rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  color: var(--ink);
}

.event-detail__subwhen {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-family: var(--font-data);
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  color: var(--ink-2);
}

/* When — multi-day range */
.event-detail__range {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-top: 1.1rem;
}

.event-detail__range-end {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.event-detail__range-end--to {
  text-align: right;
}

.event-detail__range-label {
  font-family: var(--font-data);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.event-detail__range-date {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
  line-height: 1.1;
  color: var(--ink);
}

.event-detail__range-line {
  flex: 1;
  min-width: 1.5rem;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    var(--event-hue),
    color-mix(in srgb, var(--event-hue) 30%, transparent)
  );
}

/* Location */
.event-detail__where {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--ink);
}

.event-detail__where-icon {
  flex: none;
  color: var(--ink-3);
}

/* Description */
.event-detail__desc {
  margin: 1rem 0 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--ink-2);
  white-space: pre-wrap;
}

/* The day's other events */
.event-detail__also {
  margin-top: 1.2rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.event-detail__also-label {
  margin-bottom: 0.55rem;
  font-family: var(--font-data);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.event-detail__also-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.32rem 0.4rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.event-detail__also-item:hover,
.event-detail__also-item:focus-visible {
  background: var(--bg-2);
  outline: none;
}

.event-detail__also-time {
  flex: none;
  min-width: 3.1rem;
  font-family: var(--font-data);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.event-detail__also-dot {
  flex: none;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
}

.event-detail__also-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-detail__empty {
  margin: 1.2rem 0 0;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
  font-size: 0.85rem;
  color: var(--ink-3);
}
</style>
