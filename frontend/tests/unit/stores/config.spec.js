/** Tests for config store. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from '@/stores/config'
import axios from 'axios'

// Mock axios
vi.mock('axios')

describe('Config Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useConfigStore()
    
    expect(store.orientation).toBe('landscape')
    expect(store.calendarSplit).toBe(70)
    expect(store.showUI).toBe(true)
  })

  it('should set orientation', () => {
    const store = useConfigStore()
    
    store.setOrientation('portrait')
    expect(store.orientation).toBe('portrait')
  })

  it('should set calendar split and clamp values', () => {
    const store = useConfigStore()
    
    // Test normal value
    store.setCalendarSplit(72)
    expect(store.calendarSplit).toBe(72)
    
    // Test clamping to minimum (66)
    store.setCalendarSplit(50)
    expect(store.calendarSplit).toBe(66)
    
    // Test clamping to maximum (75)
    store.setCalendarSplit(100)
    expect(store.calendarSplit).toBe(75)
  })

  it('should calculate calendar and photos width', () => {
    const store = useConfigStore()
    store.setCalendarSplit(70)
    
    expect(store.calendarWidth).toBe('70%')
    expect(store.photosWidth).toBe('30%')
  })

  it('should fetch config from API', async () => {
    const mockConfig = {
      orientation: 'portrait',
      calendarSplit: 75,
      showUI: false,
    }
    
    axios.get.mockResolvedValue({ data: mockConfig })
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(axios.get).toHaveBeenCalledWith('/api/config')
    expect(store.orientation).toBe('portrait')
    expect(store.calendarSplit).toBe(75)
    expect(store.showUI).toBe(false)
  })

  it('should update config via API and sync all values from response', async () => {
    const updateData = {
      orientation: 'landscape',
      calendarSplit: 72,
    }
    
    // Response includes more values than what was sent
    const mockResponse = {
      orientation: 'landscape',
      calendarSplit: 72,
      showUI: false,
      photoFrameEnabled: true,
      photoFrameTimeout: 600,
      photoRotationInterval: 45,
      calendarViewMode: 'rolling',
      timeFormat: '12h',
      themeMode: 'dark',
      darkModeStart: 20,
      darkModeEnd: 7,
    }
    
    axios.post.mockResolvedValue({ data: mockResponse })
    
    const store = useConfigStore()
    // Set initial values to verify they get updated
    store.showUI = true
    store.photoFrameEnabled = false
    store.photoRotationInterval = 30
    
    await store.updateConfig(updateData)
    
    expect(axios.post).toHaveBeenCalledWith('/api/config', updateData)
    // Verify ALL values from response are synced, not just the ones passed in
    expect(store.orientation).toBe('landscape')
    expect(store.calendarSplit).toBe(72)
    expect(store.showUI).toBe(false) // Updated from response
    expect(store.photoFrameEnabled).toBe(true) // Updated from response
    expect(store.photoFrameTimeout).toBe(600) // Updated from response
    expect(store.photoRotationInterval).toBe(45) // Updated from response
    expect(store.calendarViewMode).toBe('rolling') // Updated from response
    expect(store.timeFormat).toBe('12h') // Updated from response
    expect(store.themeMode).toBe('dark') // Updated from response
    expect(store.darkModeStart).toBe(20) // Updated from response
    expect(store.darkModeEnd).toBe(7) // Updated from response
  })

  it('should handle snake_case and camelCase in response', async () => {
    const mockResponse = {
      orientation: 'portrait',
      calendar_split: 73, // snake_case
      photo_frame_enabled: true, // snake_case
      showUI: false, // camelCase
      timeFormat: '24h', // camelCase
    }
    
    axios.post.mockResolvedValue({ data: mockResponse })
    
    const store = useConfigStore()
    await store.updateConfig({ orientation: 'portrait' })
    
    // Should handle both naming conventions
    expect(store.orientation).toBe('portrait')
    expect(store.calendarSplit).toBe(73)
    expect(store.photoFrameEnabled).toBe(true)
    expect(store.showUI).toBe(false)
    expect(store.timeFormat).toBe('24h')
  })

  it('should handle API errors gracefully', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })

  it('should handle updateConfig errors and throw', async () => {
    const error = new Error('Update failed')
    axios.post.mockRejectedValue(error)
    
    const store = useConfigStore()
    
    await expect(store.updateConfig({ orientation: 'portrait' })).rejects.toThrow('Update failed')
    expect(store.error).toBe('Update failed')
    expect(store.loading).toBe(false)
  })

  it('should handle all config properties in fetchConfig', async () => {
    const mockConfig = {
      orientation: 'portrait',
      calendarSplit: 75,
      showUI: false,
      photoFrameEnabled: true,
      photoFrameTimeout: 300,
      photoRotationInterval: 60,
      calendarViewMode: 'rolling',
      timeFormat: '12h',
      showModeIndicator: false,
      modeIndicatorTimeout: 10,
      weekStartDay: 1,
      showWeekNumbers: true,
      sideViewPosition: 'left',
      themeMode: 'light',
      darkModeStart: 19,
      darkModeEnd: 6,
      displayScheduleEnabled: true,
      displaySchedule: [
        { day: 0, enabled: true, onTime: '06:00', offTime: '22:00' },
        { day: 1, enabled: true, onTime: '06:00', offTime: '22:00' },
      ],
      displayTimeoutEnabled: true,
      displayTimeout: 300,
      rebootComboKey1: 'KEY_1',
      rebootComboKey2: 'KEY_7',
      rebootComboDuration: 5000,
      imageDisplayMode: 'fit',
      timezone: 'America/New_York',
    }
    
    axios.get.mockResolvedValue({ data: mockConfig })
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.orientation).toBe('portrait')
    expect(store.calendarSplit).toBe(75)
    expect(store.showUI).toBe(false)
    expect(store.photoFrameEnabled).toBe(true)
    expect(store.photoFrameTimeout).toBe(300)
    expect(store.photoRotationInterval).toBe(60)
    expect(store.calendarViewMode).toBe('rolling')
    expect(store.timeFormat).toBe('12h')
    expect(store.showModeIndicator).toBe(false)
    expect(store.modeIndicatorTimeout).toBe(10)
    expect(store.weekStartDay).toBe(1)
    expect(store.showWeekNumbers).toBe(true)
    expect(store.sideViewPosition).toBe('left')
    expect(store.themeMode).toBe('light')
    expect(store.darkModeStart).toBe(19)
    expect(store.darkModeEnd).toBe(6)
    expect(store.displayScheduleEnabled).toBe(true)
    expect(store.displaySchedule).toEqual(mockConfig.displaySchedule)
    expect(store.displayTimeoutEnabled).toBe(true)
    expect(store.displayTimeout).toBe(300)
    expect(store.rebootComboKey1).toBe('KEY_1')
    expect(store.rebootComboKey2).toBe('KEY_7')
    expect(store.rebootComboDuration).toBe(5000)
    expect(store.imageDisplayMode).toBe('fit')
    expect(store.timezone).toBe('America/New_York')
  })

  it('should handle displaySchedule as JSON string', async () => {
    const scheduleString = JSON.stringify([
      { day: 0, enabled: true, onTime: '06:00', offTime: '22:00' },
    ])
    
    const mockConfig = {
      displaySchedule: scheduleString,
    }
    
    axios.get.mockResolvedValue({ data: mockConfig })
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.displaySchedule).toEqual(JSON.parse(scheduleString))
  })

  it('should handle timezone as null', async () => {
    const mockConfig = {
      timezone: null,
    }
    
    axios.get.mockResolvedValue({ data: mockConfig })
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.timezone).toBeNull()
  })

  it('should handle timezone as undefined (defaults to null)', async () => {
    const mockConfig = {
      orientation: 'landscape',
    }
    
    axios.get.mockResolvedValue({ data: mockConfig })
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.timezone).toBeNull()
  })

  it('should set photo frame enabled', () => {
    const store = useConfigStore()
    store.setPhotoFrameEnabled(true)
    expect(store.photoFrameEnabled).toBe(true)
  })

  it('should set photo frame timeout', () => {
    const store = useConfigStore()
    store.setPhotoFrameTimeout(600)
    expect(store.photoFrameTimeout).toBe(600)
  })

  it('should toggle UI', () => {
    const store = useConfigStore()
    expect(store.showUI).toBe(true)
    store.toggleUI()
    expect(store.showUI).toBe(false)
    store.toggleUI()
    expect(store.showUI).toBe(true)
  })

  it('should set photo rotation interval', () => {
    const store = useConfigStore()
    store.setPhotoRotationInterval(45)
    expect(store.photoRotationInterval).toBe(45)
  })

  it('should set calendar view mode', () => {
    const store = useConfigStore()
    store.setCalendarViewMode('rolling')
    expect(store.calendarViewMode).toBe('rolling')
  })

  it('should set time format', () => {
    const store = useConfigStore()
    store.setTimeFormat('12h')
    expect(store.timeFormat).toBe('12h')
  })

  it('should set week start day and clamp values', () => {
    const store = useConfigStore()
    store.setWeekStartDay(1)
    expect(store.weekStartDay).toBe(1)
    
    // Test clamping
    store.setWeekStartDay(-1)
    expect(store.weekStartDay).toBe(0)
    
    store.setWeekStartDay(10)
    expect(store.weekStartDay).toBe(6)
  })

  it('should toggle side view position based on orientation', () => {
    const store = useConfigStore()
    store.setOrientation('landscape')
    store.setSideViewPosition('right')
    
    store.toggleSideViewPosition()
    expect(store.sideViewPosition).toBe('left')
    
    store.toggleSideViewPosition()
    expect(store.sideViewPosition).toBe('right')
    
    store.setOrientation('portrait')
    store.setSideViewPosition('bottom')
    
    store.toggleSideViewPosition()
    expect(store.sideViewPosition).toBe('top')
    
    store.toggleSideViewPosition()
    expect(store.sideViewPosition).toBe('bottom')
  })

  it('should set theme mode', () => {
    const store = useConfigStore()
    store.setThemeMode('dark')
    expect(store.themeMode).toBe('dark')
  })

  it('should set dark mode time', () => {
    const store = useConfigStore()
    store.setDarkModeTime(20, 7)
    expect(store.darkModeStart).toBe(20)
    expect(store.darkModeEnd).toBe(7)
  })

  it('should set image display mode', () => {
    const store = useConfigStore()
    store.setImageDisplayMode('fill')
    expect(store.imageDisplayMode).toBe('fill')
  })
})

