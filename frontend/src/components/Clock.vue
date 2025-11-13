<template>
  <div
    v-if="shouldShow"
    class="clock"
    :class="{ 'dark-mode': isDark, [`size-${clockSize}`]: true }"
  >
    <div class="clock-time">{{ formattedTime }}</div>
    <div v-if="shouldShowDate" class="clock-date">{{ formattedDate }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { useTheme } from "../composables/useTheme";

// Component name for linting
defineOptions({
  name: "ClockDisplay",
});

const props = defineProps({
  displayMode: {
    type: String,
    default: null, // Will use configStore.clockDisplayMode if not provided
    validator: (value) => value === null || ["always", "header", "off"].includes(value),
  },
  showDate: {
    type: Boolean,
    default: null, // Will use configStore.clockShowDate if not provided
  },
});

const configStore = useConfigStore();
const theme = useTheme();

const currentTime = ref(new Date());
let timeInterval = null;

// Check if clock should be displayed
const shouldShow = computed(() => {
  // If clock is disabled in config, don't show
  if (!configStore.clockEnabled) return false;
  
  // Use displayMode from props (which comes from config)
  const mode = props.displayMode !== null ? props.displayMode : configStore.clockDisplayMode;
  
  if (mode === "off") return false;
  if (mode === "always") {
    // "always" mode means show only when UI is OFF (kiosk mode)
    return !configStore.shouldShowUI;
  }
  if (mode === "header") {
    // Show only when dashboard header is visible
    return configStore.shouldShowUI;
  }
  return false;
});

// Check if date should be shown
const shouldShowDate = computed(() => {
  return props.showDate !== null ? props.showDate : configStore.clockShowDate;
});

// Get timezone from config
const timezone = computed(() => {
  return configStore.timezone || null;
});

// Get time format from config
const timeFormat = computed(() => {
  return configStore.timeFormat || "24h";
});

// Check if dark mode is active
const isDark = computed(() => {
  return theme.isDark;
});

// Get clock size from config
const clockSize = computed(() => {
  return configStore.clockSize || "medium";
});

// Format time - simplified to avoid performance issues
const formattedTime = computed(() => {
  const now = currentTime.value;
  const showSeconds = configStore.clockShowSeconds || false;
  
  const options = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat.value === "12h",
  };
  
  if (showSeconds) {
    options.second = "2-digit";
  }
  
  if (timezone.value) {
    options.timeZone = timezone.value;
  }
  
  try {
    return now.toLocaleTimeString(undefined, options);
  } catch {
    // Fallback if timezone is invalid
    const fallbackOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat.value === "12h",
    };
    if (showSeconds) {
      fallbackOptions.second = "2-digit";
    }
    return now.toLocaleTimeString(undefined, fallbackOptions);
  }
});

// Format date
const formattedDate = computed(() => {
  if (!shouldShowDate.value) return "";
  
  const now = currentTime.value;
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  
  if (timezone.value) {
    options.timeZone = timezone.value;
  }
  
  try {
    return now.toLocaleDateString(undefined, options);
  } catch {
    // Fallback if timezone is invalid
    return now.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
});

// Update time - simplified approach to avoid blocking
const updateTime = () => {
  // Only update if component should be shown
  if (!shouldShow.value) {
    // If not showing, schedule a check later but don't update
    timeInterval = setTimeout(updateTime, 1000);
    return;
  }
  
  // Simply update the time value - let formatting handle timezone
  currentTime.value = new Date();
  
  // Schedule next update based on whether seconds are shown
  const interval = configStore.clockShowSeconds ? 1000 : 60000;
  timeInterval = setTimeout(updateTime, interval);
};

// Watch for changes in clockShowSeconds to adjust update interval
watch(() => configStore.clockShowSeconds, () => {
  if (timeInterval) {
    clearTimeout(timeInterval);
    timeInterval = null;
  }
  if (shouldShow.value) {
    updateTime();
  }
});

// Watch for shouldShow changes to start/stop updates
watch(shouldShow, (newValue) => {
  if (newValue) {
    if (!timeInterval) {
      updateTime();
    }
  } else {
    if (timeInterval) {
      clearTimeout(timeInterval);
      timeInterval = null;
    }
  }
});

onMounted(() => {
  if (shouldShow.value) {
    updateTime();
  }
});

onUnmounted(() => {
  if (timeInterval) {
    clearTimeout(timeInterval);
    timeInterval = null;
  }
});
</script>

<style scoped>
.clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  color: var(--text-primary);
  font-family: "Courier New", monospace;
  user-select: none;
  min-width: fit-content;
}

.clock-time {
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
  white-space: nowrap;
}

.clock-date {
  color: var(--text-secondary);
  margin-top: 0.2rem;
  line-height: 1.2;
  white-space: nowrap;
}

/* Size variants */
.clock.size-small .clock-time {
  font-size: 1rem;
}

.clock.size-small .clock-date {
  font-size: 0.65rem;
}

.clock.size-medium .clock-time {
  font-size: 1.25rem;
}

.clock.size-medium .clock-date {
  font-size: 0.75rem;
}

.clock.size-large .clock-time {
  font-size: 1.75rem;
}

.clock.size-large .clock-date {
  font-size: 0.9rem;
}

.clock.dark-mode .clock-time {
  color: var(--text-primary);
}

.clock.dark-mode .clock-date {
  color: var(--text-secondary);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .clock-time {
    font-size: 1.25rem;
  }

  .clock-date {
    font-size: 0.75rem;
  }
}
</style>
