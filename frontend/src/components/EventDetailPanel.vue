<template>
  <div v-if="event" class="event-detail-panel" @keydown="handleKeydown">
    <div class="event-detail-header">
      <div class="event-header-main">
        <h3>{{ event.title }}</h3>
        <div class="event-date-header">
          {{ formatDate(selectedDate || event.start) }}
        </div>
      </div>
      <IconButton variant="ghost" label="Close" @click="close">×</IconButton>
    </div>
    <div class="event-detail-content">
      <!-- Show compact clickable list if multiple events -->
      <div v-if="dayEvents.length > 1" class="day-events-list">
        <div class="day-events-header">
          <span class="label">All Events ({{ dayEvents.length }})</span>
        </div>
        <div class="day-events-items">
          <div
            v-for="dayEvent in dayEvents"
            :key="dayEvent.id"
            class="day-event-item"
            :class="{ active: dayEvent.id === event.id }"
            @click="selectEvent(dayEvent)"
          >
            <div class="day-event-time">
              <span v-if="!dayEvent.all_day">{{ formatTime(dayEvent.start) }}</span>
              <span v-else>All Day</span>
            </div>
            <div class="day-event-title">
              {{ dayEvent.title }}
            </div>
          </div>
        </div>
      </div>
      <!-- Current event details (always show details of selected event) -->
      <div class="current-event-details">
        <div v-if="isMultiDay" class="event-detail-row">
          <span class="label">Selected Date:</span>
          <span class="value">{{ formatDate(selectedDate || event.start) }}</span>
        </div>
        <div v-if="isMultiDay" class="event-detail-row">
          <span class="label">Start:</span>
          <span class="value"
            >{{ formatDate(event.start)
            }}<span v-if="!event.all_day"> {{ formatTime(event.start) }}</span></span
          >
        </div>
        <div v-if="isMultiDay" class="event-detail-row">
          <span class="label">End:</span>
          <span class="value"
            >{{ formatDate(event.end)
            }}<span v-if="!event.all_day"> {{ formatTime(event.end) }}</span></span
          >
        </div>
        <div v-if="!isMultiDay" class="event-detail-row">
          <span class="label">Date:</span>
          <span class="value">{{ formatDate(selectedDate || event.start) }}</span>
        </div>
        <div v-if="showAllDayEvents && dayEvents.length === 0" class="event-detail-row">
          <span class="value" style="font-style: italic; color: var(--text-secondary)">
            No events scheduled for this day. Use arrow keys to navigate to other days.
          </span>
        </div>
        <div v-if="!isMultiDay && !event.all_day" class="event-detail-row">
          <span class="label">Time:</span>
          <span class="value">{{ formatTime(event.start) }} - {{ formatTime(event.end) }}</span>
        </div>
        <div v-if="event.location" class="event-detail-row">
          <span class="label">Location:</span>
          <span class="value">{{ event.location }}</span>
        </div>
        <div v-if="event.description" class="event-detail-row">
          <span class="label">Description:</span>
          <div class="value description">
            {{ event.description }}
          </div>
        </div>
        <div class="event-detail-row">
          <span class="label">Source:</span>
          <span class="value">{{ getSourceName(event.source) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import { useConfigStore } from "../stores/config";
import { useCalendarStore } from "../stores/calendar";

const props = defineProps({
  event: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close"]);
const configStore = useConfigStore();
const calendarStore = useCalendarStore();

const dayEvents = computed(() => calendarStore.dayEvents);
const showAllDayEvents = computed(() => calendarStore.showAllDayEvents);
const selectedDate = computed(() => calendarStore.selectedDate);

// Handle keyboard navigation - only handle Escape here
// Arrow keys are handled by the global keyboard mapping system via generic_next/generic_prev
const handleKeydown = event => {
  if (event.key === "Escape") {
    close();
    event.preventDefault();
  }
  // Let ArrowLeft/ArrowRight be handled by the keyboard mapping system
};

const selectEvent = event => {
  calendarStore.selectEvent(event);
};

const _isEventMultiDay = event => {
  if (!event) return false;
  const start = new Date(event.start);
  const end = new Date(event.end);
  // Compare calendar dates (year, month, day)
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
};

const close = () => {
  emit("close");
};

const formatDate = dateString => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

// Check if event is multi-day
const isMultiDay = computed(() => {
  if (!props.event) return false;
  const start = new Date(props.event.start);
  const end = new Date(props.event.end);
  // Compare calendar dates (year, month, day)
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
});

// Get calendar source name instead of plugin ID
const getSourceName = sourceId => {
  if (!sourceId) return "Unknown";
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
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 4px 20px var(--shadow);
  z-index: 1000;
  min-width: 400px;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  outline: none;
  border: 1px solid var(--border-color);
}

.event-detail-header {
  padding: 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.event-header-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-detail-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.event-date-header {
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}


.event-detail-content {
  padding: 1.5rem;
}

.event-detail-row {
  margin-bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.event-detail-row:last-child {
  margin-bottom: 0;
}

.label {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.value {
  color: var(--text-primary);
  font-size: 1rem;
}

.value.description {
  white-space: pre-wrap;
  line-height: 1.6;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.day-events-list {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.day-events-header {
  margin-bottom: 0.5rem;
}

.day-events-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  /* No max-height or overflow - all items must fit without scrolling */
}

.day-event-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  border: 2px solid transparent;
}

.day-event-item:hover {
  background: var(--bg-secondary);
}

.day-event-item.active {
  background: var(--calendar-today-bg);
  border-color: var(--accent-primary);
}

.day-event-time {
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 70px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.day-event-title {
  flex: 1;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.current-event-details {
  margin-top: 0.75rem;
}
</style>
