import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useCalendarStore = defineStore('calendar', () => {
  const events = ref([])
  const sources = ref([]) // Calendar sources with colors and show_time settings
  const loading = ref(false)
  const error = ref(null)
  const currentDate = ref(new Date())
  const selectedEvent = ref(null) // Currently selected/expanded event
  const dayEvents = ref([]) // All events for the expanded day
  const showAllDayEvents = ref(false) // Flag to show all events' details when expanding "today"

  const fetchSources = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get('/api/calendar/sources')
      sources.value = response.data.sources || []
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch calendar sources:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateSource = async (sourceId, updates) => {
    try {
      const response = await axios.put(`/api/calendar/sources/${sourceId}`, updates)
      // Update local sources
      const index = sources.value.findIndex(s => s.id === sourceId)
      if (index !== -1) {
        sources.value[index] = response.data
      }
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to update calendar source:', err)
      throw err
    }
  }

  const getSourceColor = (sourceId) => {
    const source = sources.value.find(s => s.id === sourceId)
    return source?.color || '#2196f3' // Default color
  }

  const shouldShowTime = (sourceId) => {
    const source = sources.value.find(s => s.id === sourceId)
    return source?.show_time !== false // Default to true
  }

  const fetchEvents = async (startDate, endDate, refreshParam = '') => {
    loading.value = true
    error.value = null
    try {
      const params = {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
      }
      
      // Add refresh parameter if provided (for cache busting)
      if (refreshParam) {
        // Parse refresh param - could be a query string or boolean
        if (typeof refreshParam === 'string' && refreshParam.includes('refresh=')) {
          // Extract refresh value from query string
          const refreshMatch = refreshParam.match(/refresh=([^&]*)/)
          if (refreshMatch) {
            params.refresh = true
          }
        } else if (refreshParam === true || refreshParam === 'true') {
          params.refresh = true
        }
      }
      
      const response = await axios.get('/api/calendar/events', { params })
      events.value = response.data.events || []
      console.log(`Fetched ${events.value.length} events from API`)
      if (events.value.length > 0) {
        console.log('Sample event:', events.value[0])
      }
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch events:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const setCurrentDate = (date) => {
    currentDate.value = date
  }

  // Helper to get calendar date components (year, month, day only)
  const getDateComponents = (date, useUTC = false) => {
    const d = new Date(date)
    if (useUTC) {
      return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
    } else {
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
    }
  }

  // Helper to compare date components
  const compareDateComponents = (date1, date2) => {
    if (date1.year !== date2.year) return date1.year - date2.year
    if (date1.month !== date2.month) return date1.month - date2.month
    return date1.day - date2.day
  }

  const selectEvent = (event) => {
    selectedEvent.value = event
    // Also collect all events for the same day using the same logic as CalendarView
    if (event) {
      const eventStart = new Date(event.start)
      
      // Get the calendar date of the selected event
      let eventDateComponents
      if (event.all_day) {
        // For all-day events, use the start date components
        eventDateComponents = getDateComponents(eventStart, false)
      } else {
        // For timed events, use the start date
        eventDateComponents = getDateComponents(eventStart, false)
      }
      
      dayEvents.value = events.value.filter((e) => {
        const eStart = new Date(e.start)
        const eEnd = new Date(e.end)
        
        if (e.all_day) {
          // All-day events: compare calendar date components
          const eStartComponents = getDateComponents(eStart, false)
          
          // Calculate end date from start + duration for all-day events
          const durationMs = eEnd.getTime() - eStart.getTime()
          const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24))
          const eEndDate = new Date(eStart)
          eEndDate.setDate(eStart.getDate() + durationDays)
          const eEndComponentsCalc = getDateComponents(eEndDate, false)
          
          // Check if event date is between start and end (inclusive)
          const startCompare = compareDateComponents(eStartComponents, eventDateComponents)
          const endCompare = compareDateComponents(eventDateComponents, eEndComponentsCalc)
          return startCompare <= 0 && endCompare <= 0
        } else {
          // Timed events: check if event overlaps with the selected event's day
          const eStartComponents = getDateComponents(eStart, false)
          const eEndComponents = getDateComponents(eEnd, false)
          
          // Check if event date is between start and end (inclusive)
          const startCompare = compareDateComponents(eStartComponents, eventDateComponents)
          const endCompare = compareDateComponents(eventDateComponents, eEndComponents)
          return startCompare <= 0 && endCompare <= 0
        }
      })
    }
  }

  const setDayEvents = (events) => {
    dayEvents.value = events
  }

  const setShowAllDayEvents = (show) => {
    showAllDayEvents.value = show
  }

  const clearSelectedEvent = () => {
    selectedEvent.value = null
    dayEvents.value = []
    showAllDayEvents.value = false
  }

  return {
    events,
    sources,
    loading,
    error,
    currentDate,
    selectedEvent,
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
  }
})

