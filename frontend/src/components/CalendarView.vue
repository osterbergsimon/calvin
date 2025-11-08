<template>
  <div
    ref="calendarView"
    class="calendar-view"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <div
      v-if="showHeader"
      class="calendar-header"
    >
      <h2>Calendar</h2>
      <div class="calendar-controls">
        <button
          class="btn-icon"
          @click="previousMonth"
          @keydown.enter="previousMonth"
        >
          ‹
        </button>
        <span class="current-month">{{ currentMonthYear }}</span>
        <button
          class="btn-icon"
          @click="nextMonth"
          @keydown.enter="nextMonth"
        >
          ›
        </button>
      </div>
    </div>
    <div
      v-else
      class="calendar-header-minimal"
    >
      <button
        class="btn-icon-minimal"
        title="Previous Month"
        @click="previousMonth"
        @keydown.enter="previousMonth"
      >
        ‹
      </button>
      <span class="current-month-minimal">{{ currentMonthYear }}</span>
      <button
        class="btn-icon-minimal"
        title="Next Month"
        @click="nextMonth"
        @keydown.enter="nextMonth"
      >
        ›
      </button>
    </div>
    <div class="calendar-content">
      <!-- Loading indicator -->
      <div
        v-if="loading"
        class="loading-overlay"
      >
        <div class="loading-spinner">
          <div class="spinner" />
          <div class="loading-text">
            Loading events...
          </div>
        </div>
      </div>
      <div
        class="calendar-grid"
        :class="{ 'rolling-view': viewMode === 'rolling', 'loading': loading }"
      >
        <!-- Day headers -->
        <div class="calendar-weekdays">
          <div
            v-for="day in weekDays"
            :key="day"
            class="weekday"
          >
            {{ day }}
          </div>
        </div>
        <!-- Calendar days -->
        <div
          class="calendar-days"
          :class="{ 'rolling-days': viewMode === 'rolling' }"
        >
          <div
            v-for="(day, dayIndex) in calendarDays"
            :key="day.date.toISOString()"
            :class="['calendar-day', { 'other-month': day.otherMonth, 'today': day.isToday, 'week-start': isWeekStart(dayIndex) }]"
          >
            <div class="day-header">
              <div class="day-number">
                {{ day.date.getDate() }}
              </div>
              <div
                v-if="showWeekNumbers && isWeekStart(dayIndex)"
                class="week-number"
              >
                {{ getWeekNumberForDay(dayIndex) }}
              </div>
            </div>
            <div class="day-events">
              <!-- All events for this day -->
              <div
                v-for="(event, eventIndex) in day.events"
                :key="`${event.id}-${day.date.toISOString()}-${eventIndex}`"
                :ref="(el) => setEventRef(el, dayIndex, eventIndex)"
                class="event-item"
                :class="{ 
                  'focused': isFocused(dayIndex, eventIndex), 
                  'selected': isSelected(event),
                  'event-start': event._isStart,
                  'event-end': event._isEnd,
                  'event-middle': event._isMiddle,
                  'event-multi-day': event._isMultiDay,
                }"
                :style="{ backgroundColor: getEventColor(event) }"
                :title="getEventTitle(event)"
                tabindex="0"
                @click="selectEvent(event)"
                @keydown.enter="selectEvent(event)"
                @keydown.space.prevent="selectEvent(event)"
                @focus="setFocusedEvent(dayIndex, eventIndex)"
              >
                <span
                  v-if="event._isStart || !event._isMultiDay"
                  class="event-text"
                >
                  {{ getEventDisplayText(event) }}
                </span>
                <span
                  v-else
                  class="event-continuation"
                >
                  <span class="continuation-arrow">←</span>
                  <span class="continuation-text">{{ truncateEventTitle(event.title, 15) }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Event Detail Panel -->
    <EventDetailPanel
      v-if="calendarStore.selectedEvent"
      :event="calendarStore.selectedEvent"
      @close="closeEventDetail"
    />
    <!-- Backdrop for modal -->
    <div
      v-if="calendarStore.selectedEvent"
      class="event-detail-backdrop"
      @click="closeEventDetail"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useCalendarStore } from '../stores/calendar'
import { useConfigStore } from '../stores/config'
import EventDetailPanel from './EventDetailPanel.vue'

const configStore = useConfigStore()
const showHeader = computed(() => configStore.showUI)
const viewMode = computed(() => configStore.calendarViewMode)
const showWeekNumbers = computed(() => configStore.showWeekNumbers)
const weekStartDay = computed(() => configStore.weekStartDay || 0)

const calendarStore = useCalendarStore()
const route = useRoute()

// Load calendar sources on mount
onMounted(async () => {
  await calendarStore.fetchSources()
})

const currentDate = computed(() => calendarStore.currentDate)
const events = computed(() => calendarStore.events)
const loading = computed(() => calendarStore.loading)
const selectedEvent = computed(() => calendarStore.selectedEvent)

const calendarView = ref(null)
const focusedDayIndex = ref(null)
const focusedEventIndex = ref(null)
const eventRefs = ref({})

// Week day names
const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Computed week days based on week start day
const weekDays = computed(() => {
  const startDay = weekStartDay.value
  const days = []
  for (let i = 0; i < 7; i++) {
    days.push(weekDayNames[(startDay + i) % 7])
  }
  return days
})

const currentMonthYear = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
})

// Helper function to normalize a date to calendar date (year, month, day only)
// For all-day events: uses UTC methods (since backend sends UTC dates for all-day events)
// For timed events: uses local time methods (to match calendar grid which is in local time)
const getCalendarDate = (date, useUTC = false) => {
  const d = new Date(date)
  if (useUTC) {
    // Use UTC methods for all-day events (backend sends UTC dates)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  } else {
    // Use local time methods for timed events (to match calendar grid)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
}

// Helper function to get calendar date components (year, month, day) for direct comparison
const getDateComponents = (date, useUTC = false) => {
  const d = new Date(date)
  if (useUTC) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
  } else {
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }
}

// Helper function to compare two date components
const compareDateComponents = (date1, date2) => {
  if (date1.year !== date2.year) return date1.year - date2.year
  if (date1.month !== date2.month) return date1.month - date2.month
  return date1.day - date2.day
}

// Helper function to get events for a specific date
const getEventsForDate = (date) => {
  if (!events.value || events.value.length === 0) return []
  
  // Calendar grid date is in local time
  const dateOnly = getCalendarDate(date, false) // false = use local time
  const dateEnd = new Date(dateOnly)
  dateEnd.setHours(23, 59, 59, 999)
  
  // Get grid date components (local time)
  const gridDateComponents = getDateComponents(date, false)
  
  return events.value.filter((event) => {
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    
    // For all-day events, compare calendar date components directly
    // For timed events, check if the date falls within the event's time range
    if (event.all_day) {
      // All-day events: backend sends UTC dates representing calendar dates
      // The start time is at midnight UTC, which represents the calendar date
      // The end time might shift to the next day in some timezones, so we use the start time
      // to determine the calendar date, and calculate the duration from there
      
      // Extract calendar date from start time (in local timezone)
      const eventStartComponents = getDateComponents(eventStart, false) // Local (auto-converts from UTC)
      
      // For the end date, we need to calculate it from the start date + duration
      // The backend sends end as the last day at 23:59:59 UTC
      // We calculate the duration in days and add it to the start date
      const durationMs = eventEnd.getTime() - eventStart.getTime()
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24))
      const eventEndDate = new Date(eventStart)
      eventEndDate.setDate(eventStart.getDate() + durationDays)
      const eventEndComponents = getDateComponents(eventEndDate, false) // Local
      
      // Compare grid date (local) with event dates
      const startCompare = compareDateComponents(eventStartComponents, gridDateComponents)
      const endCompare = compareDateComponents(gridDateComponents, eventEndComponents)
      
      // Event should show if: gridDate is between eventStart and eventEnd (inclusive)
      return startCompare <= 0 && endCompare <= 0
    } else {
      // Timed events: check if the date falls within the event's time range
      // Event spans the day if: eventStart <= dateEnd AND eventEnd >= dateOnly
      return eventStart <= dateEnd && eventEnd >= dateOnly
    }
  }).map((event) => {
    // Add metadata about event position for styling
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    
    // For all-day events, calculate end date from start date + duration
    // For timed events, use local methods to match calendar grid
    let eventStartComponents, eventEndComponents
    if (event.all_day) {
      // Extract calendar date from start time (in local timezone)
      eventStartComponents = getDateComponents(eventStart, false) // Local (auto-converts from UTC)
      
      // Calculate end date from start date + duration
      const durationMs = eventEnd.getTime() - eventStart.getTime()
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24))
      const eventEndDate = new Date(eventStart)
      eventEndDate.setDate(eventStart.getDate() + durationDays)
      eventEndComponents = getDateComponents(eventEndDate, false) // Local
    } else {
      eventStartComponents = getDateComponents(eventStart, false) // Local (auto-converts from UTC)
      eventEndComponents = getDateComponents(eventEnd, false) // Local (auto-converts from UTC)
    }
    
    // Check if event spans multiple calendar days
    const isMultiDay = compareDateComponents(eventStartComponents, eventEndComponents) !== 0
    
    // Check if current date is the start or end day
    const isStart = compareDateComponents(eventStartComponents, gridDateComponents) === 0
    const isEnd = compareDateComponents(eventEndComponents, gridDateComponents) === 0
    
    return {
      ...event,
      _isStart: isStart,
      _isEnd: isEnd,
      _isMultiDay: isMultiDay,
      _isMiddle: isMultiDay && !isStart && !isEnd,
    }
  })
}

// Helper function to get event color from calendar source
const getEventColor = (event) => {
  // First try event's own color
  if (event.color) {
    return event.color
  }
  // Then try calendar source color
  // Check if source exists in calendar sources (valid source ID)
  if (event.source && calendarStore.sources.length > 0) {
    const source = calendarStore.sources.find(s => s.id === event.source)
    if (source && source.color) {
      return source.color
    }
  }
  // Default color
  return '#2196f3'
}

// Helper function to format event time
const formatEventTime = (event) => {
  if (event.all_day) {
    return 'All day'
  }
  const start = new Date(event.start)
  const end = new Date(event.end)
  const timeFormat = configStore.timeFormat || '24h'
  const timeOptions = timeFormat === '24h' 
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: 'numeric', minute: '2-digit', hour12: true }
  const startTime = start.toLocaleTimeString('en-US', timeOptions)
  const endTime = end.toLocaleTimeString('en-US', timeOptions)
  return `${startTime} - ${endTime}`
}

// Helper function to get event title with time if needed
const getEventTitle = (event) => {
  const time = formatEventTime(event)
  return `${event.title} (${time})`
}

// Helper function to truncate event title for continuation display
const truncateEventTitle = (title, maxLength) => {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength - 3) + '...'
}

// Helper function to get event display text
const getEventDisplayText = (event) => {
  // Check if we should show time for this event's source
  // Only check if source is a valid source ID (not 'google' or 'mock')
  if (event.source && event.source !== 'google' && event.source !== 'mock') {
    const showTime = calendarStore.shouldShowTime(event.source)
    if (showTime && !event.all_day) {
      const start = new Date(event.start)
      const timeFormat = configStore.timeFormat || '24h'
      const timeOptions = timeFormat === '24h'
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: 'numeric', minute: '2-digit', hour12: true }
      const time = start.toLocaleTimeString('en-US', timeOptions)
      return `${time} ${event.title}`
    }
  } else if (!event.all_day) {
    // For events without a valid source ID, show time by default
    const start = new Date(event.start)
    const timeFormat = configStore.timeFormat || '24h'
    const timeOptions = timeFormat === '24h'
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { hour: 'numeric', minute: '2-digit', hour12: true }
    const time = start.toLocaleTimeString('en-US', timeOptions)
    return `${time} ${event.title}`
  }
  return event.title
}

// Helper function to get week number for a date (ISO 8601 week numbering)
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// Helper function to adjust day of week based on week start day
const adjustDayOfWeek = (dayOfWeek) => {
  // dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
  // weekStartDay: 0=Sunday, 1=Monday, ..., 6=Saturday
  // Return adjusted day where 0 = week start day
  return (dayOfWeek - weekStartDay.value + 7) % 7
}

// Helper function to get date at start of week for a given date
const getWeekStart = (date) => {
  const d = new Date(date)
  const dayOfWeek = d.getDay()
  const adjustedDay = adjustDayOfWeek(dayOfWeek)
  d.setDate(d.getDate() - adjustedDay)
  d.setHours(0, 0, 0, 0)
  return d
}

const calendarDays = computed(() => {
  if (viewMode.value === 'rolling') {
    // Rolling weeks view: show 4 weeks starting from today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const days = []
    const startDate = getWeekStart(today)
    
    // Generate 4 weeks (28 days)
    for (let i = 0; i < 28; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      const dateOnly = new Date(date)
      dateOnly.setHours(0, 0, 0, 0)
      
      days.push({
        date,
        otherMonth: date.getMonth() !== today.getMonth(),
        isToday: dateOnly.getTime() === today.getTime(),
        events: getEventsForDate(date),
      })
    }
    
    return days
  } else {
    // Month view: show full month
    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()
    
    // First day of month
    const firstDay = new Date(year, month, 1)
    const firstDayOfWeek = firstDay.getDay()
    const adjustedFirstDay = adjustDayOfWeek(firstDayOfWeek)
    
    // Last day of month
    const lastDay = new Date(year, month + 1, 0)
    const lastDate = lastDay.getDate()
    
    // Days array
    const days = []
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i)
      days.push({
        date,
        otherMonth: true,
        isToday: false,
        events: getEventsForDate(date),
      })
    }
    
    // Current month days
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day)
      const dateOnly = new Date(date)
      dateOnly.setHours(0, 0, 0, 0)
      
      days.push({
        date,
        otherMonth: false,
        isToday: dateOnly.getTime() === today.getTime(),
        events: getEventsForDate(date),
      })
    }
    
    // Next month days (fill to 6 weeks = 42 days)
    const remainingDays = 42 - days.length
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day)
      days.push({
        date,
        otherMonth: true,
        isToday: false,
        events: getEventsForDate(date),
      })
    }
    
    return days
  }
})

// Helper function to check if a day is the start of a week
const isWeekStart = (dayIndex) => {
  // First day of calendar is always a week start
  if (dayIndex === 0) return true
  // Every 7th day is a week start (based on week start day setting)
  return dayIndex % 7 === 0
}

// Helper function to get week number for a specific day
const getWeekNumberForDay = (dayIndex) => {
  if (!showWeekNumbers.value || dayIndex >= calendarDays.value.length) {
    return null
  }
  
  const day = calendarDays.value[dayIndex]
  if (!day) return null
  
  // Get the first day of the week that contains this date
  const weekStart = getWeekStart(day.date)
  const weekNum = getWeekNumber(weekStart)
  return weekNum
}

// Get all events in a flat list for keyboard navigation
const allEvents = computed(() => {
  const flatEvents = []
  calendarDays.value.forEach((day, dayIndex) => {
    day.events.forEach((event, eventIndex) => {
      flatEvents.push({
        event,
        dayIndex,
        eventIndex,
      })
    })
  })
  return flatEvents
})

const setEventRef = (el, dayIndex, eventIndex) => {
  if (el) {
    const key = `${dayIndex}-${eventIndex}`
    eventRefs.value[key] = el
  }
}

const isFocused = (dayIndex, eventIndex) => {
  return focusedDayIndex.value === dayIndex && focusedEventIndex.value === eventIndex
}

const isSelected = (event) => {
  return selectedEvent.value && selectedEvent.value.id === event.id
}

const setFocusedEvent = (dayIndex, eventIndex) => {
  focusedDayIndex.value = dayIndex
  focusedEventIndex.value = eventIndex
}

const focusEvent = (dayIndex, eventIndex) => {
  const key = `${dayIndex}-${eventIndex}`
  const element = eventRefs.value[key]
  if (element) {
    element.focus()
  }
}

const selectEvent = (event) => {
  calendarStore.selectEvent(event)
}

const closeEventDetail = () => {
  calendarStore.clearSelectedEvent()
  // Return focus to the calendar view
  if (calendarView.value) {
    calendarView.value.focus()
  }
}

const navigateEvents = (direction) => {
  if (allEvents.value.length === 0) return
  
  let currentIndex = -1
  if (focusedDayIndex.value !== null && focusedEventIndex.value !== null) {
    currentIndex = allEvents.value.findIndex(
      (item) => item.dayIndex === focusedDayIndex.value && item.eventIndex === focusedEventIndex.value
    )
  }
  
  let newIndex = currentIndex
  if (direction === 'next') {
    newIndex = currentIndex < allEvents.value.length - 1 ? currentIndex + 1 : 0
  } else if (direction === 'prev') {
    newIndex = currentIndex > 0 ? currentIndex - 1 : allEvents.value.length - 1
  } else if (direction === 'first') {
    newIndex = 0
  } else if (direction === 'last') {
    newIndex = allEvents.value.length - 1
  }
  
  if (newIndex >= 0 && newIndex < allEvents.value.length) {
    const target = allEvents.value[newIndex]
    setFocusedEvent(target.dayIndex, target.eventIndex)
    nextTick(() => {
      focusEvent(target.dayIndex, target.eventIndex)
    })
  }
}

const handleKeydown = (event) => {
  // Don't handle if event detail panel is open (let it handle its own keys)
  if (selectedEvent.value) {
    if (event.key === 'Escape') {
      closeEventDetail()
      event.preventDefault()
    }
    return
  }
  
  switch (event.key) {
    case 'ArrowRight':
      navigateEvents('next')
      event.preventDefault()
      break
    case 'ArrowLeft':
      navigateEvents('prev')
      event.preventDefault()
      break
    case 'Home':
      navigateEvents('first')
      event.preventDefault()
      break
    case 'End':
      navigateEvents('last')
      event.preventDefault()
      break
    case 'Enter':
      // Expand the focused event or all events for the focused day
      if (focusedDayIndex.value !== null) {
        const day = calendarDays.value[focusedDayIndex.value]
        if (day && day.events.length > 0) {
          if (focusedEventIndex.value !== null && focusedEventIndex.value < day.events.length) {
            // Expand the focused event
            selectEvent(day.events[focusedEventIndex.value])
          } else {
            // Expand the first event of the day
            selectEvent(day.events[0])
          }
        }
      }
      event.preventDefault()
      break
    case 'ArrowUp':
      previousMonth()
      event.preventDefault()
      break
    case 'ArrowDown':
      nextMonth()
      event.preventDefault()
      break
    case 'PageUp':
      previousMonth()
      event.preventDefault()
      break
    case 'PageDown':
      nextMonth()
      event.preventDefault()
      break
  }
}

const previousMonth = () => {
  const newDate = new Date(currentDate.value)
  newDate.setMonth(newDate.getMonth() - 1)
  calendarStore.setCurrentDate(newDate)
  loadEvents()
  // Clear focus when month changes
  focusedDayIndex.value = null
  focusedEventIndex.value = null
}

const nextMonth = () => {
  const newDate = new Date(currentDate.value)
  newDate.setMonth(newDate.getMonth() + 1)
  calendarStore.setCurrentDate(newDate)
  loadEvents()
  // Clear focus when month changes
  focusedDayIndex.value = null
  focusedEventIndex.value = null
}

const loadEvents = async () => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  
  // Expand date range to include events that span across month boundaries
  // Load 7 days before the month start and 7 days after the month end
  // This ensures multi-day events that start in the previous month or end in the next month are included
  const startDate = new Date(year, month, 1)
  startDate.setDate(startDate.getDate() - 7) // 7 days before month start
  startDate.setHours(0, 0, 0, 0)
  
  const endDate = new Date(year, month + 1, 0)
  endDate.setDate(endDate.getDate() + 7) // 7 days after month end
  endDate.setHours(23, 59, 59, 999)
  
  try {
    // Force refresh when viewing current month to ensure newly added events are visible
    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    const refresh = isCurrentMonth
    
    await calendarStore.fetchEvents(startDate, endDate, refresh)
    console.log(`Loaded ${calendarStore.events.length} events for ${year}-${month + 1} (range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`)
  } catch (error) {
    console.error('Failed to load events:', error)
  }
}

watch(currentDate, () => {
  loadEvents()
})

// Watch for route changes to reload events when navigating back to dashboard
watch(() => route.path, (newPath, oldPath) => {
  // Reload events when navigating back to dashboard from settings
  if (newPath === '/' && oldPath === '/settings') {
    loadEvents()
    // Also reload sources to ensure they're up to date
    calendarStore.fetchSources()
  }
}, { immediate: false })

onMounted(() => {
  loadEvents()
  // Focus the calendar view on mount for keyboard navigation
  if (calendarView.value) {
    calendarView.value.focus()
  }
})

// Reload events when component is activated (if using keep-alive)
onActivated(() => {
  // Only reload if events are empty or if we're on the dashboard route
  if (route.path === '/' && (events.value.length === 0 || !calendarStore.sources.length)) {
    loadEvents()
    // Also reload sources if they're empty
    if (calendarStore.sources.length === 0) {
      calendarStore.fetchSources()
    }
  }
})
</script>

<style scoped>
.calendar-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--calendar-bg);
  border-radius: 8px;
  overflow: hidden;
  outline: none;
}

.calendar-view:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}

.calendar-header {
  padding: 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.calendar-header-minimal {
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.calendar-header-minimal:hover {
  opacity: 1;
}

.btn-icon-minimal {
  background: transparent;
  border: none;
  border-radius: 4px;
  width: 28px;
  height: 28px;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-icon-minimal:hover {
  background: rgba(0, 0, 0, 0.1);
}

.current-month-minimal {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 120px;
  text-align: center;
}

.calendar-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.calendar-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.current-month {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 150px;
  text-align: center;
}

.btn-icon {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-icon:active {
  background: var(--bg-tertiary);
}

.btn-icon:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.calendar-content {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.calendar-view:has(.calendar-header-minimal) .calendar-content {
  padding: 0.5rem;
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--calendar-bg);
  border-radius: 8px;
  padding: 1rem;
}

.calendar-grid.loading {
  opacity: 0.5;
  pointer-events: none;
}

.calendar-grid.rolling-view {
  /* Rolling view specific styles if needed */
}

.calendar-days.rolling-days {
  /* Rolling days specific styles if needed */
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.weekday {
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.5rem;
}

.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  flex: 1;
}

.calendar-day {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  background: var(--calendar-bg);
  transition: background 0.2s;
}

.calendar-day:hover {
  background: var(--bg-secondary);
}

.calendar-day.other-month {
  opacity: 0.4;
  background: var(--bg-tertiary);
}

.calendar-day.today {
  border: 2px solid var(--accent-primary);
  background: var(--calendar-today-bg);
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.25rem;
}

.day-number {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
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
}

.event-item {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  outline: none;
  position: relative;
}

.event-item.event-multi-day {
  /* Multi-day events get special styling */
}

.event-item.event-start {
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: -1px;
  z-index: 1;
  border-right: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-item.event-end {
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -1px;
  z-index: 1;
  border-left: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-item.event-middle {
  border-radius: 0;
  margin-left: -1px;
  margin-right: -1px;
  z-index: 1;
  border-left: 1px dashed rgba(255, 255, 255, 0.3);
  border-right: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-continuation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  font-size: 0.85rem;
  opacity: 0.9;
  padding: 0 4px;
}

.continuation-arrow {
  font-size: 0.9rem;
  opacity: 0.7;
  flex-shrink: 0;
}

.continuation-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.event-text {
  display: inline-block;
}

.event-item:hover {
  opacity: 0.9;
  transform: scale(1.02);
}

.event-item:focus {
  outline: 2px solid #fff; /* Keep white for contrast on colored event backgrounds */
  outline-offset: -2px;
  border-color: #fff; /* Keep white for contrast on colored event backgrounds */
  box-shadow: 0 0 0 2px var(--accent-primary);
  z-index: 10;
  position: relative;
}

.event-item.focused {
  outline: 2px solid #fff; /* Keep white for contrast on colored event backgrounds */
  outline-offset: -2px;
  border-color: #fff; /* Keep white for contrast on colored event backgrounds */
  box-shadow: 0 0 0 2px var(--accent-primary);
  z-index: 10;
  position: relative;
}

.event-item.event-start.focused,
.event-item.event-end.focused,
.event-item.event-middle.focused {
  z-index: 11;
}

.event-item.selected {
  border: 2px solid #fff;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.8);
}

.event-detail-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}
</style>
