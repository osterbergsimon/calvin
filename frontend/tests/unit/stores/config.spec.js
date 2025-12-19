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

  it('should update config via API', async () => {
    const updateData = {
      orientation: 'landscape',
      calendarSplit: 72,
    }
    
    const mockResponse = {
      orientation: 'landscape',
      calendarSplit: 72,
      showUI: true,
    }
    
    axios.post.mockResolvedValue({ data: mockResponse })
    
    const store = useConfigStore()
    await store.updateConfig(updateData)
    
    expect(axios.post).toHaveBeenCalledWith('/api/config', updateData)
    expect(store.orientation).toBe('landscape')
    expect(store.calendarSplit).toBe(72)
  })

  it('should handle API errors gracefully', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useConfigStore()
    await store.fetchConfig()
    
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })
})

