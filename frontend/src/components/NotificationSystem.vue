<template>
  <Transition name="notification">
    <div v-if="visible" class="notification" :class="[typeClass, sizeClass, positionClass]">
      <div class="notification-content">
        <div class="notification-icon">
          {{ icon }}
        </div>
        <div class="notification-message">
          {{ message }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";

const configStore = useConfigStore();
const modeStore = useModeStore();

const visible = ref(false);
const notificationType = ref("keyboard"); // 'keyboard', 'mode', 'info', 'success', 'error'
const icon = ref("");
const message = ref("");

// Map key codes to user-friendly labels
const keyLabels = {
  KEY_1: "1",
  KEY_2: "2",
  KEY_3: "3",
  KEY_4: "4",
  KEY_5: "5",
  KEY_6: "6",
  KEY_7: "7",
  KEY_RIGHT: "→",
  KEY_LEFT: "←",
  KEY_UP: "↑",
  KEY_DOWN: "↓",
  KEY_SPACE: "Space",
  KEY_ENTER: "Enter",
  KEY_ESCAPE: "Esc",
  KEY_HOME: "Home",
  KEY_END: "End",
  KEY_PAGEUP: "PgUp",
  KEY_PAGEDOWN: "PgDn",
  KEY_S: "S",
};

// Map actions to user-friendly labels
const actionLabels = {
  // Screen jump
  screen_jump_calendar: "Calendar Screen",
  screen_jump_photos: "Photos Screen",
  screen_jump_services: "Services Screen",
  mode_settings: "Settings",

  // Screens and regions
  screen_next: "Next Screen",
  screen_prev: "Previous Screen",
  screen_1: "Screen 1",
  screen_2: "Screen 2",
  screen_3: "Screen 3",
  screen_4: "Screen 4",
  screen_5: "Screen 5",
  screen_6: "Screen 6",
  screen_7: "Screen 7",
  region_next: "Next Region",
  region_prev: "Previous Region",

  // Generic actions
  generic_next: "Next",
  generic_prev: "Previous",
  generic_expand_close: "Expand/Close",
  generic_refresh: "Refresh",

  // Refresh actions (context-aware)
  calendar_refresh: "Refresh",
  service_refresh: "Refresh",

  // Calendar actions
  calendar_next: "Next",
  calendar_prev: "Previous",
  calendar_next_month: "Next Month",
  calendar_prev_month: "Previous Month",
  calendar_next_day: "Next Day",
  calendar_prev_day: "Previous Day",
  calendar_expand: "Expand",
  calendar_expand_today: "Expand Today",
  calendar_collapse: "Collapse",
  calendar_next_event: "Next Event",
  calendar_prev_event: "Previous Event",

  // Image actions
  images_next: "Next Image",
  images_prev: "Previous Image",

  // Web service actions
  web_service_1: "Web Service 1",
  web_service_2: "Web Service 2",
  web_service_next: "Next Service",
  web_service_prev: "Previous Service",

  // Other
  none: "No Action",
};

const getModeIcon = () => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
      return "📷";
    } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
      return "🌐";
    }
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
      return "📅";
    } else if (modeStore.currentMode === modeStore.MODES.PHOTOS) {
      return "📷";
    } else if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
      return "🌐";
    }
  }
  return "•";
};

const getModeMessage = () => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
      return "Fullscreen Photos";
    } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
      return "Fullscreen Web Services";
    }
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
      return "Calendar Mode";
    } else if (modeStore.currentMode === modeStore.MODES.PHOTOS) {
      return "Photos Mode";
    } else if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
      return "Web Services Mode";
    }
  }
  return "Dashboard";
};

const typeClass = computed(() => {
  if (notificationType.value === "mode") {
    // Mode-specific colors
    if (modeStore.isFullscreen) {
      if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) {
        return "notification-photos";
      } else if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) {
        return "notification-web-services";
      }
    } else {
      if (modeStore.currentMode === modeStore.MODES.CALENDAR) {
        return "notification-calendar";
      } else if (modeStore.currentMode === modeStore.MODES.PHOTOS) {
        return "notification-photos";
      } else if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) {
        return "notification-web-services";
      }
    }
    return "notification-default";
  }
  // Keyboard feedback classes
  if (notificationType.value === "keyboard") {
    const action = message.value;
    if (action?.startsWith("Mode:")) {
      return "notification-mode";
    } else if (action?.startsWith("Calendar:")) {
      return "notification-calendar";
    } else if (action?.startsWith("Images:") || action?.startsWith("Web Service:")) {
      return "notification-media";
    }
  }
  // Generic notification types
  return `notification-${notificationType.value}`;
});

const sizeClass = computed(() => {
  const mode = configStore.keyboardFeedbackMode || "normal";
  return `notification-${mode}`;
});

const positionClass = computed(() => {
  // All notifications use the same position based on feedback mode
  const mode = configStore.keyboardFeedbackMode || "normal";
  if (mode === "small") {
    return "notification-position-bottom-right";
  }
  return "notification-position-center";
});

let hideTimeout = null;

const show = (type, iconValue, messageValue, duration = null) => {
  // Only show if enabled in config (for keyboard and mode notifications)
  if ((type === "keyboard" || type === "mode") && !configStore.keyboardFeedbackEnabled) {
    return;
  }

  notificationType.value = type;
  icon.value = iconValue;
  message.value = messageValue;
  visible.value = true;

  // Clear existing timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // Use provided duration or default based on type
  let timeoutDuration;
  if (duration !== null) {
    timeoutDuration = duration;
  } else if (type === "mode") {
    // Mode changes use configured timeout
    const timeout = configStore.modeIndicatorTimeout || 0;
    timeoutDuration = timeout > 0 ? timeout * 1000 : 1500;
  } else {
    // Keyboard feedback shows for 1.5 seconds
    timeoutDuration = 1500;
  }

  hideTimeout = setTimeout(() => {
    visible.value = false;
  }, timeoutDuration);
};

const showKeyboardFeedback = (key, actionName) => {
  const keyLabel = keyLabels[key] || key.replace("KEY_", "");
  const actionLabel = actionLabels[actionName] || actionName || "Unknown";
  show("keyboard", keyLabel, actionLabel);
};

const showModeChange = () => {
  // Don't show mode indicator if UI is visible (only show when UI is hidden)
  if (configStore.shouldShowUI) {
    return;
  }
  show("mode", getModeIcon(), getModeMessage());
};

// Watch for mode changes to show mode indicator
watch(
  () => [modeStore.currentMode, modeStore.isFullscreen, modeStore.fullscreenMode],
  () => {
    showModeChange();
  },
  { immediate: false }
);

// Watch for config changes
watch(
  () => configStore.keyboardFeedbackEnabled,
  enabled => {
    if (
      !enabled &&
      visible.value &&
      (notificationType.value === "keyboard" || notificationType.value === "mode")
    ) {
      visible.value = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  }
);

// Watch for UI visibility changes (show mode when UI is hidden)
watch(
  () => configStore.shouldShowUI,
  showUI => {
    if (!showUI) {
      // Show mode indicator when UI is hidden
      showModeChange();
    } else if (notificationType.value === "mode" && visible.value) {
      // Hide mode indicator when UI is shown
      visible.value = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  }
);

// Expose methods for parent components
defineExpose({
  show,
  showKeyboardFeedback,
  showModeChange,
});
</script>

<style scoped>
.notification {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  user-select: none;
}

/* Position classes */
.notification-position-center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.notification-position-bottom-right {
  bottom: 20px;
  right: 20px;
  transform: none;
}

.notification-content {
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

/* Small mode styling */
.notification-small .notification-content {
  padding: 8px 12px;
  border-radius: 8px;
  min-width: auto;
  gap: 4px;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.notification-small .notification-icon {
  font-size: 20px;
  text-shadow: 0 0 5px rgba(74, 222, 128, 0.4);
}

.notification-small .notification-message {
  font-size: 11px;
  opacity: 0.85;
}

.notification-icon {
  font-size: 48px;
  font-weight: bold;
  line-height: 1;
  color: #4ade80; /* Green accent */
  text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
}

.notification-message {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  text-transform: capitalize;
}

/* Different colors for different notification types */
.notification-mode .notification-icon {
  color: #60a5fa; /* Blue */
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.5);
}

.notification-calendar .notification-icon {
  color: #fbbf24; /* Yellow */
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

.notification-media .notification-icon {
  color: #a78bfa; /* Purple */
  text-shadow: 0 0 10px rgba(167, 139, 250, 0.5);
}

.notification-photos .notification-icon {
  color: #4ade80; /* Green */
  text-shadow: 0 0 10px rgba(76, 222, 128, 0.5);
}

.notification-web-services .notification-icon {
  color: #fbbf24; /* Yellow/Orange */
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

.notification-info .notification-icon {
  color: #60a5fa; /* Blue */
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.5);
}

.notification-success .notification-icon {
  color: #4ade80; /* Green */
  text-shadow: 0 0 10px rgba(76, 222, 128, 0.5);
}

.notification-error .notification-icon {
  color: #ef4444; /* Red */
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
}

/* Small mode color adjustments */
.notification-small.notification-mode .notification-icon {
  text-shadow: 0 0 5px rgba(96, 165, 250, 0.4);
}

.notification-small.notification-calendar .notification-icon {
  text-shadow: 0 0 5px rgba(251, 191, 36, 0.4);
}

.notification-small.notification-media .notification-icon {
  text-shadow: 0 0 5px rgba(167, 139, 250, 0.4);
}

.notification-small.notification-photos .notification-icon {
  text-shadow: 0 0 5px rgba(76, 222, 128, 0.4);
}

.notification-small.notification-web-services .notification-icon {
  text-shadow: 0 0 5px rgba(251, 191, 36, 0.4);
}

/* Transition animations */
.notification-enter-active {
  transition: all 0.3s ease-out;
}

.notification-leave-active {
  transition: all 0.2s ease-in;
}

.notification-enter-from {
  opacity: 0;
}

.notification-position-center.notification-enter-from {
  transform: translate(-50%, -50%) scale(0.8);
}

.notification-position-bottom-right.notification-enter-from {
  transform: translateY(10px) scale(0.9);
}

.notification-leave-to {
  opacity: 0;
}

.notification-position-center.notification-leave-to {
  transform: translate(-50%, -50%) scale(0.9);
}

.notification-position-bottom-right.notification-leave-to {
  transform: translateY(-5px) scale(0.95);
}
</style>
