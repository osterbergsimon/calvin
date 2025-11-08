import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModeStore = defineStore('mode', () => {
  // Available modes
  const MODES = {
    CALENDAR: 'calendar',
    PHOTOS: 'photos',
    WEB_SERVICES: 'web_services',
    SETTINGS: 'settings',
  }

  const currentMode = ref(MODES.CALENDAR)
  const previousMode = ref(null) // For returning from settings
  const isFullscreen = ref(false) // Track if we're in fullscreen mode
  const fullscreenMode = ref(null) // Which mode is fullscreen (PHOTOS or WEB_SERVICES)

  const setMode = (mode) => {
    if (mode === MODES.SETTINGS) {
      // Store previous mode when entering settings
      previousMode.value = currentMode.value
    }
    // When switching modes, exit fullscreen and stay on dashboard
    isFullscreen.value = false
    fullscreenMode.value = null
    currentMode.value = mode
  }

  const enterFullscreen = (mode) => {
    isFullscreen.value = true
    fullscreenMode.value = mode
  }

  const exitFullscreen = () => {
    isFullscreen.value = false
    fullscreenMode.value = null
    // Return to calendar mode (home view)
    currentMode.value = MODES.CALENDAR
  }

  const returnFromSettings = () => {
    if (previousMode.value) {
      currentMode.value = previousMode.value
      previousMode.value = null
    } else {
      currentMode.value = MODES.CALENDAR
    }
  }

  const cycleMode = () => {
    const modeOrder = [MODES.CALENDAR, MODES.PHOTOS, MODES.WEB_SERVICES]
    const currentIndex = modeOrder.indexOf(currentMode.value)
    const nextIndex = (currentIndex + 1) % modeOrder.length
    setMode(modeOrder[nextIndex])
  }

  return {
    MODES,
    currentMode,
    previousMode,
    isFullscreen,
    fullscreenMode,
    setMode,
    enterFullscreen,
    exitFullscreen,
    returnFromSettings,
    cycleMode,
  }
})

