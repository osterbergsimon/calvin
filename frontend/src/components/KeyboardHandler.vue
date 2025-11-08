<template>
  <div style="display: none;">
    <!-- This component handles keyboard events globally -->
    <span />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useKeyboardStore } from '../stores/keyboard'
import { useKeyboardActions } from '../composables/useKeyboardActions'
import { usePhotoFrameMode } from '../composables/usePhotoFrameMode'

const keyboardStore = useKeyboardStore()
const { handleAction } = useKeyboardActions()
const { resetInactivityTimer } = usePhotoFrameMode()

// Map browser key codes to our key codes
const keyCodeMap = {
  ArrowRight: 'KEY_RIGHT',
  ArrowLeft: 'KEY_LEFT',
  ArrowUp: 'KEY_UP',
  ArrowDown: 'KEY_DOWN',
  Space: 'KEY_SPACE',
  Enter: 'KEY_ENTER',
  Escape: 'KEY_ESCAPE',
  Home: 'KEY_HOME',
  End: 'KEY_END',
  PageUp: 'KEY_PAGEUP',
  PageDown: 'KEY_PAGEDOWN',
  Digit1: 'KEY_1',
  Digit2: 'KEY_2',
  Digit3: 'KEY_3',
  Digit4: 'KEY_4',
  Digit5: 'KEY_5',
  Digit6: 'KEY_6',
  Digit7: 'KEY_7',
  KeyS: 'KEY_S',
}

const onKeyDown = async (event) => {
  // Don't handle if user is typing in an input/textarea
  if (
    event.target.tagName === 'INPUT' ||
    event.target.tagName === 'TEXTAREA' ||
    event.target.isContentEditable
  ) {
    return
  }

  // Map browser key to our key code
  const keyCode = keyCodeMap[event.code] || event.code

  // Get keyboard type from store
  const keyboardType = keyboardStore.keyboardType || '7-button'

  // Get mappings for current keyboard type
  // Mappings structure: { "7-button": { "KEY_1": "action" }, "standard": { ... } }
  const mappings = keyboardStore.mappings[keyboardType] || {}

  // Find action for this key
  const action = mappings[keyCode]

  if (action && action !== 'none') {
    event.preventDefault()
    // Reset inactivity timer on any keyboard action
    resetInactivityTimer()
    handleAction(action)
  } else {
    // Even if no mapped action, reset timer on any keypress
    resetInactivityTimer()
  }
}

onMounted(async () => {
  // Load keyboard mappings and config
  try {
    await keyboardStore.fetchMappings()
    // Load keyboard type from config API
    const response = await fetch('/api/config')
    if (response.ok) {
      const config = await response.json()
      if (config.keyboardType) {
        keyboardStore.setKeyboardType(config.keyboardType)
      }
    }
  } catch (error) {
    console.error('Failed to load keyboard mappings:', error)
  }

  // Add global keyboard listener
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  // Remove keyboard listener
  window.removeEventListener('keydown', onKeyDown)
})
</script>

