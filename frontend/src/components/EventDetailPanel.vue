<template>
  <div
    v-if="event"
    class="event-detail-panel"
    @keydown.esc="close"
  >
    <div class="event-detail-header">
      <h3>{{ event.title }}</h3>
      <button
        class="btn-close"
        aria-label="Close"
        @click="close"
      >
        ×
      </button>
    </div>
    <div class="event-detail-content">
      <!-- Show all events for the day if expanding "today" via keyboard -->
      <div
        v-if="showAllDayEvents && dayEvents.length > 1"
        class="all-day-events-details"
      >
        <div class="day-events-header">
          <span class="label">All Events for {{ formatDate(event.start) }} ({{ dayEvents.length }})</span>
        </div>
        <div class="all-events-list">
          <div
            v-for="dayEvent in dayEvents"
            :key="dayEvent.id"
            class="day-event-detail-card"
            :class="{ 'active': dayEvent.id === event.id }"
          >
            <div class="day-event-detail-header">
              <h4>{{ dayEvent.title }}</h4>
            </div>
            <div class="day-event-detail-content">
              <div
                v-if="isEventMultiDay(dayEvent)"
                class="event-detail-row"
              >
                <span class="label">Start:</span>
                <span class="value">{{ formatDate(dayEvent.start) }}<span v-if="!dayEvent.all_day"> {{ formatTime(dayEvent.start) }}</span></span>
              </div>
              <div
                v-if="isEventMultiDay(dayEvent)"
                class="event-detail-row"
              >
                <span class="label">End:</span>
                <span class="value">{{ formatDate(dayEvent.end) }}<span v-if="!dayEvent.all_day"> {{ formatTime(dayEvent.end) }}</span></span>
              </div>
              <div
                v-if="!isEventMultiDay(dayEvent)"
                class="event-detail-row"
              >
                <span class="label">Date:</span>
                <span class="value">{{ formatDate(dayEvent.start) }}</span>
              </div>
              <div
                v-if="!isEventMultiDay(dayEvent) && !dayEvent.all_day"
                class="event-detail-row"
              >
                <span class="label">Time:</span>
                <span class="value">{{ formatTime(dayEvent.start) }} - {{ formatTime(dayEvent.end) }}</span>
              </div>
              <div
                v-if="dayEvent.all_day && !isEventMultiDay(dayEvent)"
                class="event-detail-row"
              >
                <span class="label">Time:</span>
                <span class="value">All Day</span>
              </div>
              <div
                v-if="dayEvent.location"
                class="event-detail-row"
              >
                <span class="label">Location:</span>
                <span class="value">{{ dayEvent.location }}</span>
              </div>
              <div
                v-if="dayEvent.description"
                class="event-detail-row"
              >
                <span class="label">Description:</span>
                <div class="value description">
                  {{ dayEvent.description }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Show clickable list if not keyboard expand -->
      <div
        v-else-if="dayEvents.length > 1"
        class="day-events-list"
      >
        <div class="day-events-header">
          <span class="label">All Events ({{ dayEvents.length }})</span>
        </div>
        <div class="day-events-items">
          <div
            v-for="dayEvent in dayEvents"
            :key="dayEvent.id"
            class="day-event-item"
            :class="{ 'active': dayEvent.id === event.id }"
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
      <!-- Current event details (only show if not showing all events) -->
      <div
        v-if="!showAllDayEvents || dayEvents.length === 1"
        class="current-event-details"
      >
        <div
          v-if="isMultiDay"
          class="event-detail-row"
        >
          <span class="label">Start:</span>
          <span class="value">{{ formatDate(event.start) }}<span v-if="!event.all_day"> {{ formatTime(event.start) }}</span></span>
        </div>
        <div
          v-if="isMultiDay"
          class="event-detail-row"
        >
          <span class="label">End:</span>
          <span class="value">{{ formatDate(event.end) }}<span v-if="!event.all_day"> {{ formatTime(event.end) }}</span></span>
        </div>
        <div
          v-if="!isMultiDay"
          class="event-detail-row"
        >
          <span class="label">Date:</span>
          <span class="value">{{ formatDate(event.start) }}</span>
        </div>
        <div
          v-if="!isMultiDay && !event.all_day"
          class="event-detail-row"
        >
          <span class="label">Time:</span>
          <span class="value">{{ formatTime(event.start) }} - {{ formatTime(event.end) }}</span>
        </div>
        <div
          v-if="event.location"
          class="event-detail-row"
        >
          <span class="label">Location:</span>
          <span class="value">{{ event.location }}</span>
        </div>
        <div
          v-if="event.description"
          class="event-detail-row"
        >
          <span class="label">Description:</span>
          <div class="value description">
            {{ event.description }}
          </div>
        </div>
        <div class="event-detail-row">
          <span class="label">Source:</span>
          <span class="value">{{ event.source }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { useCalendarStore } from '../stores/calendar'

const props = defineProps({
  event: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])
const configStore = useConfigStore()
const calendarStore = useCalendarStore()

const dayEvents = computed(() => calendarStore.dayEvents)
const showAllDayEvents = computed(() => calendarStore.showAllDayEvents)

const selectEvent = (event) => {
  calendarStore.selectEvent(event)
}

const isEventMultiDay = (event) => {
  if (!event) return false
  const start = new Date(event.start)
  const end = new Date(event.end)
  // Compare calendar dates (year, month, day)
  return start.getFullYear() !== end.getFullYear() ||
         start.getMonth() !== end.getMonth() ||
         start.getDate() !== end.getDate()
}

const close = () => {
  emit('close')
}

const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatTime = (dateString) => {
  const date = new Date(dateString)
  const timeFormat = configStore.timeFormat || '24h'
  const timeOptions = timeFormat === '24h'
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit', hour12: true }
  return date.toLocaleTimeString('en-US', timeOptions)
}

// Check if event is multi-day
const isMultiDay = computed(() => {
  if (!props.event) return false
  const start = new Date(props.event.start)
  const end = new Date(props.event.end)
  // Compare calendar dates (year, month, day)
  return start.getFullYear() !== end.getFullYear() ||
         start.getMonth() !== end.getMonth() ||
         start.getDate() !== end.getDate()
})
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

.event-detail-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-close:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.event-detail-content {
  padding: 1.5rem;
}

.event-detail-row {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.day-events-header {
  margin-bottom: 0.75rem;
}

.day-events-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.day-event-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
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
  min-width: 80px;
  font-size: 0.9rem;
}

.day-event-title {
  flex: 1;
  color: var(--text-primary);
}

.current-event-details {
  margin-top: 1rem;
}

/* All day events details view (for keyboard expand) */
.all-day-events-details {
  margin-bottom: 1.5rem;
}

.all-events-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.day-event-detail-card {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1rem;
  background: var(--bg-tertiary);
  transition: all 0.2s;
}

.day-event-detail-card.active {
  border-color: var(--accent-primary);
  background: var(--calendar-today-bg);
  box-shadow: 0 2px 8px var(--shadow);
}

.day-event-detail-header {
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.day-event-detail-header h4 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
  font-weight: 600;
}

.day-event-detail-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>

