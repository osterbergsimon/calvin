/** Tests for keyboard store. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useKeyboardStore } from '@/stores/keyboard'
import axios from 'axios'

// Mock axios
vi.mock('axios')

describe('Keyboard Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useKeyboardStore()
    
    expect(store.mappings).toEqual({})
    expect(store.keyboardType).toBe('7-button')
    expect(store.available).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('should fetch keyboard mappings', async () => {
    const mockMappings = {
      '7-button': {
        KEY_1: 'generic_next',
        KEY_2: 'generic_prev',
      },
      standard: {
        KEY_RIGHT: 'generic_next',
        KEY_LEFT: 'generic_prev',
      },
    }
    
    axios.get.mockResolvedValue({ data: { mappings: mockMappings } })
    
    const store = useKeyboardStore()
    await store.fetchMappings()
    
    expect(axios.get).toHaveBeenCalledWith('/api/keyboard/mappings')
    expect(store.mappings).toEqual(mockMappings)
    expect(store.available).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('should fetch keyboard mappings for specific type', async () => {
    const mockMappings = {
      '7-button': {
        KEY_1: 'generic_next',
        KEY_2: 'generic_prev',
      },
    }
    
    axios.get.mockResolvedValue({ data: { mappings: mockMappings } })
    
    const store = useKeyboardStore()
    await store.fetchMappings('7-button')
    
    expect(axios.get).toHaveBeenCalledWith('/api/keyboard/mappings?keyboard_type=7-button')
    expect(store.mappings).toEqual(mockMappings)
    expect(store.available).toBe(true)
  })

  it('should handle fetch mappings errors', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useKeyboardStore()
    
    await expect(store.fetchMappings()).rejects.toThrow('Network error')
    expect(store.error).toBe('Network error')
    expect(store.available).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('should update keyboard mappings', async () => {
    const newMappings = {
      '7-button': {
        KEY_1: 'mode_calendar',
        KEY_2: 'mode_photos',
      },
    }
    const mockResponse = { mappings: newMappings }
    
    axios.post.mockResolvedValue({ data: mockResponse })
    
    const store = useKeyboardStore()
    await store.updateMappings(newMappings)
    
    expect(axios.post).toHaveBeenCalledWith('/api/keyboard/mappings', {
      mappings: newMappings,
    })
    expect(store.mappings).toEqual(newMappings)
    expect(store.loading).toBe(false)
  })

  it('should handle update mappings errors', async () => {
    const error = new Error('Update failed')
    axios.post.mockRejectedValue(error)
    
    const store = useKeyboardStore()
    
    await expect(store.updateMappings({})).rejects.toThrow('Update failed')
    expect(store.error).toBe('Update failed')
    expect(store.loading).toBe(false)
  })

  it('should set keyboard type', () => {
    const store = useKeyboardStore()
    
    store.setKeyboardType('standard')
    expect(store.keyboardType).toBe('standard')
    
    store.setKeyboardType('7-button')
    expect(store.keyboardType).toBe('7-button')
  })
})

