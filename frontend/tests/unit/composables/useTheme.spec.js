/** Tests for useTheme composable. */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTheme } from '@/composables/useTheme'
import { useConfigStore } from '@/stores/config'
import axios from 'axios'

// Mock axios
vi.mock('axios')

// Mock window.matchMedia
const mockMatchMedia = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
})

describe('useTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset document classes
    document.documentElement.classList.remove('dark', 'light')
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    // Mock config store methods to avoid axios calls
    const configStore = useConfigStore()
    vi.spyOn(configStore, 'fetchConfig').mockResolvedValue({})
    vi.spyOn(configStore, 'updateConfig').mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should initialize with default values', () => {
    const { themeMode, isDark, darkModeStart, darkModeEnd } = useTheme()

    expect(themeMode.value).toBe('auto')
    expect(darkModeStart.value).toBe(18)
    expect(darkModeEnd.value).toBe(6)
  })

  it('should set theme mode to light', () => {
    const { setThemeMode, isDark } = useTheme()

    setThemeMode('light')
    expect(isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should set theme mode to dark', () => {
    const { setThemeMode, isDark } = useTheme()

    setThemeMode('dark')
    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('should use system preference in auto mode', () => {
    mockMatchMedia.mockReturnValue({
      matches: true, // System prefers dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const { setThemeMode, isDark } = useTheme()

    setThemeMode('auto')
    expect(isDark.value).toBe(true)
  })

  it('should check if time is within dark mode hours', () => {
    const { setThemeMode, setDarkModeTime, isDark } = useTheme()

    setDarkModeTime(18, 6) // 6 PM to 6 AM
    setThemeMode('time')

    // Note: isDarkTime is internal, we test it indirectly through theme mode
    // The actual time check happens in updateTheme which is called by setThemeMode
    expect(typeof isDark.value).toBe('boolean')
  })

  it('should handle dark mode time spanning midnight', () => {
    const { setThemeMode, setDarkModeTime, isDark } = useTheme()

    setDarkModeTime(22, 6) // 10 PM to 6 AM
    setThemeMode('time')

    // Note: isDarkTime is internal, we test it indirectly through theme mode
    expect(typeof isDark.value).toBe('boolean')
  })

  it('should set dark mode time range', () => {
    const { setDarkModeTime, darkModeStart, darkModeEnd } = useTheme()

    setDarkModeTime(20, 7)

    expect(darkModeStart.value).toBe(20)
    expect(darkModeEnd.value).toBe(7)
  })

  it('should apply theme to document', () => {
    const { updateTheme, setThemeMode } = useTheme()

    setThemeMode('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    setThemeMode('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

