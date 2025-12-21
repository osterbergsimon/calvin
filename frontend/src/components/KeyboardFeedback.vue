<template>
  <Transition name="keyboard-feedback">
    <div
      v-if="visible"
      class="keyboard-feedback"
      :class="[feedbackClass, sizeClass, positionClass]"
    >
      <div class="keyboard-feedback-content">
        <div class="keyboard-feedback-key">{{ keyLabel }}</div>
        <div class="keyboard-feedback-action">{{ actionLabel }}</div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useConfigStore } from "../stores/config";

const configStore = useConfigStore();

const visible = ref(false);
const keyCode = ref("");
const action = ref("");

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
  // Mode switching
  mode_calendar: "Calendar Mode",
  mode_photos: "Photos Mode",
  mode_web_services: "Web Services Mode",
  mode_spare: "Spare Mode",
  mode_settings: "Settings",
  mode_cycle: "Cycle Mode",

  // Generic actions
  generic_next: "Next",
  generic_prev: "Previous",
  generic_expand_close: "Expand/Close",

  // Calendar actions
  calendar_next: "Next",
  calendar_prev: "Previous",
  calendar_next_month: "Next Month", // Legacy
  calendar_prev_month: "Previous Month", // Legacy
  calendar_next_day: "Next Day",
  calendar_prev_day: "Previous Day",
  calendar_expand: "Expand",
  calendar_expand_today: "Expand Today", // Legacy
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

const keyLabel = computed(() => {
  return keyLabels[keyCode.value] || keyCode.value.replace("KEY_", "");
});

const actionLabel = computed(() => {
  return actionLabels[action.value] || action.value || "Unknown";
});

const feedbackClass = computed(() => {
  // Add different classes based on action type for visual variety
  if (action.value?.startsWith("mode_")) {
    return "feedback-mode";
  } else if (action.value?.startsWith("calendar_")) {
    return "feedback-calendar";
  } else if (
    action.value?.startsWith("images_") ||
    action.value?.startsWith("web_service_")
  ) {
    return "feedback-media";
  }
  return "feedback-default";
});

const sizeClass = computed(() => {
  const mode = configStore.keyboardFeedbackMode || "normal";
  return `feedback-${mode}`;
});

const positionClass = computed(() => {
  const mode = configStore.keyboardFeedbackMode || "normal";
  if (mode === "small") {
    // Position in bottom-right corner for small mode
    return "feedback-position-bottom-right";
  }
  return "feedback-position-center";
});

let hideTimeout = null;

const show = (key, actionName) => {
  // Only show if enabled in config
  if (!configStore.keyboardFeedbackEnabled) {
    return;
  }

  keyCode.value = key;
  action.value = actionName;
  visible.value = true;

  // Clear existing timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  // Hide after 1.5 seconds
  hideTimeout = setTimeout(() => {
    visible.value = false;
  }, 1500);
};

// Watch for config changes
watch(
  () => configStore.keyboardFeedbackEnabled,
  (enabled) => {
    if (!enabled && visible.value) {
      visible.value = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  },
);

// Expose show method for parent components
defineExpose({
  show,
});
</script>

<style scoped>
.keyboard-feedback {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  user-select: none;
}

/* Position classes */
.feedback-position-center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.feedback-position-bottom-right {
  bottom: 20px;
  right: 20px;
  transform: none;
}

.keyboard-feedback-content {
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
.feedback-small .keyboard-feedback-content {
  padding: 8px 12px;
  border-radius: 8px;
  min-width: auto;
  gap: 4px;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.feedback-small .keyboard-feedback-key {
  font-size: 20px;
  text-shadow: 0 0 5px rgba(74, 222, 128, 0.4);
}

.feedback-small .keyboard-feedback-action {
  font-size: 11px;
  opacity: 0.85;
}

.keyboard-feedback-key {
  font-size: 48px;
  font-weight: bold;
  line-height: 1;
  color: #4ade80; /* Green accent */
  text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
}

.keyboard-feedback-action {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  text-transform: capitalize;
}

/* Different colors for different action types */
.feedback-mode .keyboard-feedback-key {
  color: #60a5fa; /* Blue */
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.5);
}

.feedback-calendar .keyboard-feedback-key {
  color: #fbbf24; /* Yellow */
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

.feedback-media .keyboard-feedback-key {
  color: #a78bfa; /* Purple */
  text-shadow: 0 0 10px rgba(167, 139, 250, 0.5);
}

/* Small mode color adjustments */
.feedback-small.feedback-mode .keyboard-feedback-key {
  text-shadow: 0 0 5px rgba(96, 165, 250, 0.4);
}

.feedback-small.feedback-calendar .keyboard-feedback-key {
  text-shadow: 0 0 5px rgba(251, 191, 36, 0.4);
}

.feedback-small.feedback-media .keyboard-feedback-key {
  text-shadow: 0 0 5px rgba(167, 139, 250, 0.4);
}

/* Transition animations */
.keyboard-feedback-enter-active {
  transition: all 0.3s ease-out;
}

.keyboard-feedback-leave-active {
  transition: all 0.2s ease-in;
}

.keyboard-feedback-enter-from {
  opacity: 0;
}

.feedback-position-center.keyboard-feedback-enter-from {
  transform: translate(-50%, -50%) scale(0.8);
}

.feedback-position-bottom-right.keyboard-feedback-enter-from {
  transform: translateY(10px) scale(0.9);
}

.keyboard-feedback-leave-to {
  opacity: 0;
}

.feedback-position-center.keyboard-feedback-leave-to {
  transform: translate(-50%, -50%) scale(0.9);
}

.feedback-position-bottom-right.keyboard-feedback-leave-to {
  transform: translateY(-5px) scale(0.95);
}
</style>
