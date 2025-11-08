<template>
  <div class="mode-indicator" :class="{ 'hidden': !show }">
    <div class="mode-icon" :class="modeClass" :title="modeLabel">
      <span class="icon-text">{{ modeIcon }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useModeStore } from '../stores/mode'
import { useConfigStore } from '../stores/config'

const modeStore = useModeStore()
const configStore = useConfigStore()

const isVisible = ref(false)
let hideTimer = null

// Show indicator when mode changes
const showIndicator = () => {
  if (!configStore.showModeIndicator) {
    isVisible.value = false
    return
  }
  
  // Clear any existing timer
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  
  // Show the indicator
  isVisible.value = true
  
  // Hide after timeout (if timeout > 0)
  const timeout = configStore.modeIndicatorTimeout || 0
  if (timeout > 0) {
    hideTimer = setTimeout(() => {
      isVisible.value = false
      hideTimer = null
    }, timeout * 1000) // Convert seconds to milliseconds
  }
}

// Watch for mode changes
watch(() => [modeStore.currentMode, modeStore.isFullscreen, modeStore.fullscreenMode], () => {
  showIndicator()
}, { immediate: true })

// Watch for config changes
watch(() => configStore.showModeIndicator, (newVal) => {
  if (newVal) {
    showIndicator()
  } else {
    isVisible.value = false
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }
})

// Watch for timeout changes
watch(() => configStore.modeIndicatorTimeout, () => {
  if (isVisible.value) {
    showIndicator() // Restart timer with new timeout
  }
})

onUnmounted(() => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
})

const show = computed(() => configStore.showModeIndicator && isVisible.value)

const modeClass = computed(() => {
  if (modeStore.isFullscreen) {
    return `mode-${modeStore.fullscreenMode}`
  }
  return `mode-${modeStore.currentMode}`
})

const modeIcon = computed(() => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
      return '📷'
    } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
      return '🌐'
    }
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
      return '📅'
    } else if (modeStore.currentMode === modeStore.MODES.PHOTOS) {
      return '📷'
    } else if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
      return '🌐'
    }
  }
  return '•'
})

const modeLabel = computed(() => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
      return 'Fullscreen Photos'
    } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
      return 'Fullscreen Web Services'
    }
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
      return 'Calendar Mode'
    } else if (modeStore.currentMode === modeStore.MODES.PHOTOS) {
      return 'Photos Mode'
    } else if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
      return 'Web Services Mode'
    }
  }
  return 'Dashboard'
})
</script>

<style scoped>
.mode-indicator {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 1000;
  pointer-events: none;
  transition: opacity 0.3s;
  opacity: 1;
}

.mode-indicator.hidden {
  opacity: 0;
  pointer-events: none;
}

.mode-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s;
}

.mode-icon:hover {
  background: rgba(0, 0, 0, 0.85);
  border-color: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.icon-text {
  font-size: 1.5rem;
  line-height: 1;
}

/* Mode-specific colors */
.mode-calendar {
  border-color: rgba(33, 150, 243, 0.5);
}

.mode-photos {
  border-color: rgba(76, 175, 80, 0.5);
}

.mode-web_services {
  border-color: rgba(255, 152, 0, 0.5);
}
</style>

