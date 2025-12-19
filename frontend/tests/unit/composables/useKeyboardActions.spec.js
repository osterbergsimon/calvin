/** Tests for useKeyboardActions composable. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useModeStore } from '@/stores/mode'
import { useCalendarStore } from '@/stores/calendar'
import { useImagesStore } from '@/stores/images'
import { useWebServicesStore } from '@/stores/webServices'
import { useKeyboardActions } from '@/composables/useKeyboardActions'

// Mock vue-router - return a resolved promise to avoid unhandled rejections
const mockPush = vi.fn().mockResolvedValue(undefined)
vi.mock('vue-router', () => {
  return {
    useRouter: () => {
      return {
        push: mockPush,
      }
    },
  }
})

describe('useKeyboardActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should handle mode switching actions', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()

    handleAction('mode_calendar')
    expect(modeStore.currentMode).toBe(modeStore.MODES.CALENDAR)
    expect(mockPush).toHaveBeenCalledWith('/')

    handleAction('mode_photos')
    expect(modeStore.currentMode).toBe(modeStore.MODES.PHOTOS)

    handleAction('mode_web_services')
    expect(modeStore.currentMode).toBe(modeStore.MODES.WEB_SERVICES)

    handleAction('mode_settings')
    expect(modeStore.currentMode).toBe(modeStore.MODES.SETTINGS)
    expect(mockPush).toHaveBeenCalledWith('/settings')
  })

  it('should handle calendar navigation actions', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const calendarStore = useCalendarStore()

    modeStore.setMode(modeStore.MODES.CALENDAR)
    const initialDate = new Date(calendarStore.currentDate)

    handleAction('calendar_next_month')
    const nextMonth = new Date(initialDate)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    expect(calendarStore.currentDate.getMonth()).toBe(nextMonth.getMonth())

    handleAction('calendar_prev_month')
    expect(calendarStore.currentDate.getMonth()).toBe(initialDate.getMonth())
  })

  it('should not navigate calendar when not in calendar mode', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const calendarStore = useCalendarStore()

    modeStore.setMode(modeStore.MODES.PHOTOS)
    const initialDate = new Date(calendarStore.currentDate)

    handleAction('calendar_next_month')
    expect(calendarStore.currentDate.getMonth()).toBe(initialDate.getMonth())
  })

  it('should handle image navigation actions', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const imagesStore = useImagesStore()

    // Mock the methods to return resolved promises to avoid unhandled rejections
    vi.spyOn(imagesStore, 'nextImage').mockResolvedValue({ image: null })
    vi.spyOn(imagesStore, 'previousImage').mockResolvedValue({ image: null })

    modeStore.setMode(modeStore.MODES.PHOTOS)
    handleAction('images_next')
    expect(imagesStore.nextImage).toHaveBeenCalled()

    handleAction('images_prev')
    expect(imagesStore.previousImage).toHaveBeenCalled()
  })

  it('should handle generic next action based on mode', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const calendarStore = useCalendarStore()
    const imagesStore = useImagesStore()

    // Mock to return resolved promise to avoid unhandled rejections
    vi.spyOn(imagesStore, 'nextImage').mockResolvedValue({ image: null })

    // In calendar mode, generic_next should navigate month
    modeStore.setMode(modeStore.MODES.CALENDAR)
    const initialMonth = calendarStore.currentDate.getMonth()
    handleAction('generic_next')
    expect(calendarStore.currentDate.getMonth()).toBe((initialMonth + 1) % 12)

    // In photos mode, generic_next should navigate images
    modeStore.setMode(modeStore.MODES.PHOTOS)
    handleAction('generic_next')
    expect(imagesStore.nextImage).toHaveBeenCalled()
  })

  it('should handle generic prev action based on mode', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const calendarStore = useCalendarStore()
    const imagesStore = useImagesStore()

    // Mock to return resolved promise to avoid unhandled rejections
    vi.spyOn(imagesStore, 'previousImage').mockResolvedValue({ image: null })

    // In calendar mode, generic_prev should navigate month
    modeStore.setMode(modeStore.MODES.CALENDAR)
    const initialMonth = calendarStore.currentDate.getMonth()
    handleAction('generic_prev')
    expect(calendarStore.currentDate.getMonth()).toBe((initialMonth - 1 + 12) % 12)

    // In photos mode, generic_prev should navigate images
    modeStore.setMode(modeStore.MODES.PHOTOS)
    handleAction('generic_prev')
    expect(imagesStore.previousImage).toHaveBeenCalled()
  })

  it('should handle web service navigation', () => {
    const { handleAction } = useKeyboardActions()
    const modeStore = useModeStore()
    const webServicesStore = useWebServicesStore()

    webServicesStore.services = [
      { id: 'svc1', name: 'Service 1' },
      { id: 'svc2', name: 'Service 2' },
    ]

    modeStore.setMode(modeStore.MODES.WEB_SERVICES)
    webServicesStore.currentServiceIndex = 0

    handleAction('web_service_next')
    expect(webServicesStore.currentServiceIndex).toBe(1)

    handleAction('web_service_prev')
    expect(webServicesStore.currentServiceIndex).toBe(0)
  })

  it('should handle unknown actions gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { handleAction } = useKeyboardActions()

    handleAction('unknown_action')

    expect(consoleSpy).toHaveBeenCalledWith('Unknown keyboard action: unknown_action')
    consoleSpy.mockRestore()
  })
})

