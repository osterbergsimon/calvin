/** Tests for calendar store. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCalendarStore } from '@/stores/calendar'
import axios from 'axios'

// Mock axios
vi.mock('axios')

describe('Calendar Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useCalendarStore()
    
    expect(store.events).toEqual([])
    expect(store.sources).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
    expect(store.selectedEvent).toBe(null)
    expect(store.dayEvents).toEqual([])
    expect(store.showAllDayEvents).toBe(false)
  })

  it('should fetch calendar sources', async () => {
    const mockSources = [
      { id: 'source1', name: 'Calendar 1', color: '#ff0000' },
      { id: 'source2', name: 'Calendar 2', color: '#00ff00' },
    ]
    
    axios.get.mockResolvedValue({ data: { sources: mockSources } })
    
    const store = useCalendarStore()
    await store.fetchSources()
    
    expect(axios.get).toHaveBeenCalledWith('/api/calendar/sources')
    expect(store.sources).toEqual(mockSources)
    expect(store.loading).toBe(false)
  })

  it('should handle fetch sources errors', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useCalendarStore()
    
    await expect(store.fetchSources()).rejects.toThrow('Network error')
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })

  it('should update calendar source', async () => {
    const mockSource = { id: 'source1', name: 'Updated Calendar', color: '#0000ff' }
    axios.put.mockResolvedValue({ data: mockSource })
    
    const store = useCalendarStore()
    store.sources = [{ id: 'source1', name: 'Calendar 1', color: '#ff0000' }]
    
    await store.updateSource('source1', { color: '#0000ff' })
    
    expect(axios.put).toHaveBeenCalledWith('/api/calendar/sources/source1', { color: '#0000ff' })
    expect(store.sources[0]).toEqual(mockSource)
  })

  it('should get source color', () => {
    const store = useCalendarStore()
    store.sources = [
      { id: 'source1', color: '#ff0000' },
      { id: 'source2', color: '#00ff00' },
    ]
    
    expect(store.getSourceColor('source1')).toBe('#ff0000')
    expect(store.getSourceColor('source2')).toBe('#00ff00')
    expect(store.getSourceColor('nonexistent')).toBe('#2196f3') // Default
  })

  it('should check if time should be shown', () => {
    const store = useCalendarStore()
    store.sources = [
      { id: 'source1', show_time: true },
      { id: 'source2', show_time: false },
      { id: 'source3' }, // No show_time property
    ]
    
    expect(store.shouldShowTime('source1')).toBe(true)
    expect(store.shouldShowTime('source2')).toBe(false)
    expect(store.shouldShowTime('source3')).toBe(true) // Default to true
    expect(store.shouldShowTime('nonexistent')).toBe(true) // Default to true
  })

  it('should fetch events', async () => {
    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-01-31')
    const mockEvents = [
      { id: 'event1', title: 'Event 1', start: '2024-01-15T10:00:00Z' },
      { id: 'event2', title: 'Event 2', start: '2024-01-20T14:00:00Z' },
    ]
    
    axios.get.mockResolvedValue({ data: { events: mockEvents } })
    
    const store = useCalendarStore()
    await store.fetchEvents(startDate, endDate)
    
    expect(axios.get).toHaveBeenCalledWith('/api/calendar/events', {
      params: {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      },
    })
    expect(store.events).toEqual(mockEvents)
    expect(store.loading).toBe(false)
  })

  it('should fetch events with refresh parameter', async () => {
    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-01-31')
    
    axios.get.mockResolvedValue({ data: { events: [] } })
    
    const store = useCalendarStore()
    await store.fetchEvents(startDate, endDate, true)
    
    expect(axios.get).toHaveBeenCalledWith('/api/calendar/events', {
      params: {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        refresh: true,
      },
    })
  })

  it('should set current date', () => {
    const store = useCalendarStore()
    const newDate = new Date('2024-06-15')
    
    store.setCurrentDate(newDate)
    
    expect(store.currentDate).toEqual(newDate)
  })

  // Note: getDateComponents and compareDateComponents are internal helpers
  // They are tested indirectly through selectEvent which uses them

  it('should select event and filter day events', () => {
    const store = useCalendarStore()
    const event = {
      id: 'event1',
      title: 'Test Event',
      start: '2024-06-15T10:00:00Z',
      end: '2024-06-15T11:00:00Z',
      all_day: false,
    }
    
    store.events = [
      event,
      {
        id: 'event2',
        title: 'Other Day Event',
        start: '2024-06-16T10:00:00Z',
        end: '2024-06-16T11:00:00Z',
        all_day: false,
      },
      {
        id: 'event3',
        title: 'Same Day Event',
        start: '2024-06-15T14:00:00Z',
        end: '2024-06-15T15:00:00Z',
        all_day: false,
      },
    ]
    
    store.selectEvent(event)
    
    expect(store.selectedEvent).toEqual(event)
    expect(store.dayEvents.length).toBe(2) // event1 and event3
    expect(store.dayEvents.map(e => e.id)).toEqual(['event1', 'event3'])
  })

  it('should handle all-day events when selecting', () => {
    const store = useCalendarStore()
    const allDayEvent = {
      id: 'event1',
      title: 'All Day Event',
      start: '2024-06-15T00:00:00Z',
      end: '2024-06-16T00:00:00Z',
      all_day: true,
    }
    
    store.events = [allDayEvent]
    store.selectEvent(allDayEvent)
    
    expect(store.selectedEvent).toEqual(allDayEvent)
    expect(store.dayEvents.length).toBe(1)
  })

  it('should set day events', () => {
    const store = useCalendarStore()
    const events = [
      { id: 'event1', title: 'Event 1' },
      { id: 'event2', title: 'Event 2' },
    ]
    
    store.setDayEvents(events)
    
    expect(store.dayEvents).toEqual(events)
  })

  it('should set show all day events flag', () => {
    const store = useCalendarStore()
    
    store.setShowAllDayEvents(true)
    expect(store.showAllDayEvents).toBe(true)
    
    store.setShowAllDayEvents(false)
    expect(store.showAllDayEvents).toBe(false)
  })

  it('should clear selected event', () => {
    const store = useCalendarStore()
    store.selectedEvent = { id: 'event1' }
    store.dayEvents = [{ id: 'event1' }]
    store.showAllDayEvents = true
    
    store.clearSelectedEvent()
    
    expect(store.selectedEvent).toBe(null)
    expect(store.dayEvents).toEqual([])
    expect(store.showAllDayEvents).toBe(false)
  })
})

