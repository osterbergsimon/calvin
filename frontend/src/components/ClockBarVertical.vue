<template>
  <div
    v-if="shouldShow"
    class="clock-bar-vertical"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: `${barPadding}px` }"
  >
    <div
      class="clock-bar-content"
      :class="{
        'layout-single-line': layout === 'single-line',
        'layout-two-lines': layout === 'two-lines',
      }"
    >
      <span class="clock-time" :style="{ fontSize: `${fontSize}px` }">{{ formattedTime }}</span>
      <span v-if="showDate" class="clock-date" :style="{ fontSize: `${dateFontSize}px` }">{{
        formattedDate
      }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";

defineOptions({
  name: "ClockBarVertical",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["left", "right", "between"].includes(value),
  },
  showInNonKiosk: {
    type: Boolean,
    default: false,
  },
  showInKiosk: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  previewMode: {
    type: Boolean,
    default: false,
  },
  previewTimeSize: {
    type: Number,
    default: null,
  },
  previewDateSize: {
    type: Number,
    default: null,
  },
  previewLayout: {
    type: String,
    default: null,
  },
  previewPadding: {
    type: Number,
    default: null,
  },
});

const configStore = useConfigStore();

const currentTime = ref(new Date());
let timeInterval = null;

// Check if clock bar should be displayed
const shouldShow = computed(() => {
  // Always show in preview mode
  if (props.previewMode) return true;

  if (!props.enabled) return false;

  // Show in non-kiosk mode (UI visible)
  if (props.showInNonKiosk && configStore.shouldShowUI) {
    return true;
  }
  // Show in kiosk mode (UI hidden)
  if (props.showInKiosk && !configStore.shouldShowUI) {
    return true;
  }
  return false;
});

// Get timezone from config
const timezone = computed(() => {
  return configStore.timezone || null;
});

// Get time format from config
const timeFormat = computed(() => {
  return configStore.timeFormat || "24h";
});

// Get show date setting
const showDate = computed(() => {
  return configStore.clockShowDate || false;
});

// Get show seconds setting
const showSeconds = computed(() => {
  return configStore.clockShowSeconds || false;
});

// Get font sizes and layout (use preview props if in preview mode)
const fontSize = computed(() => {
  if (props.previewMode && props.previewTimeSize !== null) {
    return props.previewTimeSize;
  }
  return configStore.clockBarFontSize || 16;
});

const dateFontSize = computed(() => {
  if (props.previewMode && props.previewDateSize !== null) {
    return props.previewDateSize;
  }
  return configStore.clockBarDateFontSize || 14;
});

const layout = computed(() => {
  if (props.previewMode && props.previewLayout !== null) {
    return props.previewLayout;
  }
  return configStore.clockBarLayout || "single-line";
});

const barPadding = computed(() => {
  if (props.previewMode && props.previewPadding !== null) {
    return props.previewPadding;
  }
  return configStore.clockBarPadding || 8;
});

// Format time
const formattedTime = computed(() => {
  const now = currentTime.value;

  const options = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat.value === "12h",
  };

  if (showSeconds.value) {
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
    if (showSeconds.value) {
      fallbackOptions.second = "2-digit";
    }
    return now.toLocaleTimeString(undefined, fallbackOptions);
  }
});

// Format date - respects locale and date format preferences
const formattedDate = computed(() => {
  if (!showDate.value) return "";

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

// Update time
const updateTime = () => {
  if (!shouldShow.value) {
    timeInterval = setTimeout(updateTime, 1000);
    return;
  }

  currentTime.value = new Date();

  const interval = showSeconds.value ? 1000 : 60000;
  timeInterval = setTimeout(updateTime, interval);
};

// Watch for changes in clockShowSeconds to adjust update interval
watch(
  () => configStore.clockShowSeconds,
  () => {
    if (timeInterval) {
      clearTimeout(timeInterval);
      timeInterval = null;
    }
    if (shouldShow.value) {
      updateTime();
    }
  }
);

// Watch for shouldShow changes to start/stop updates
watch(shouldShow, newValue => {
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
.clock-bar-vertical {
  height: 100%;
  width: auto;
  min-width: fit-content;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  /* Padding is set via inline style from barPadding computed property */
}

.clock-bar-vertical.position-right {
  border-left: 1px solid var(--border-color);
  border-right: none;
}

.clock-bar-vertical.position-between {
  border: none;
  background: transparent;
  /* Padding is set via inline style from barPadding computed property */
}

.clock-bar-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: "Courier New", monospace;
  writing-mode: vertical-rl;
  text-orientation: upright;
  white-space: nowrap;
}

.clock-bar-content.layout-two-lines {
  flex-direction: column;
  gap: 0.25rem;
}

.clock-time {
  font-weight: 600;
  color: var(--text-primary);
}

.clock-date {
  color: var(--text-secondary);
}

/* Minimal styling for between position */
.clock-bar-vertical.position-between {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.clock-bar-vertical.position-between .clock-time {
  font-size: 0.875rem;
}

.clock-bar-vertical.position-between .clock-date {
  font-size: 0.75rem;
}
</style>
