<template>
  <div
    v-if="shouldShow"
    class="clock-bar-horizontal"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: `${barPadding}px` }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div class="clock-bar-outer">
      <div class="clock-bar-side clock-bar-left">
        <PluginStatusbarItems />
        <span v-if="isBackgroundRefreshing" class="clock-refresh-icon" aria-hidden="true" />
      </div>

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

      <div class="clock-bar-side clock-bar-right">
        <BarActionCluster v-if="!previewMode" :compact="false" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useCalendarStore } from "../stores/calendar";
import { useClockBar } from "../composables/useClockBar";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";
import BarActionCluster from "./BarActionCluster.vue";

defineOptions({
  name: "ClockBarHorizontal",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["top", "bottom", "between"].includes(value),
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

const {
  shouldShow,
  showDate,
  formattedTime,
  formattedDate,
  fontSize,
  dateFontSize,
  layout,
  barPadding,
} = useClockBar({
  enabled: () => props.enabled,
  showInKiosk: () => props.showInKiosk,
  showInNonKiosk: () => props.showInNonKiosk,
  previewMode: () => props.previewMode,
  previewTimeSize: () => props.previewTimeSize,
  previewDateSize: () => props.previewDateSize,
  previewLayout: () => props.previewLayout,
  previewPadding: () => props.previewPadding,
});

const calendarStore = useCalendarStore();
const isBackgroundRefreshing = computed(() => calendarStore.backgroundRefreshing);
</script>

<style scoped>
.clock-bar-horizontal {
  width: 100%;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  user-select: none;
}

.clock-bar-horizontal.position-bottom {
  border-top: 1px solid var(--border-color);
  border-bottom: none;
}

.clock-bar-horizontal.position-between {
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.clock-bar-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-family: "Courier New", monospace;
}

.clock-bar-content.layout-two-lines {
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
}

.clock-time {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.clock-date {
  color: var(--text-secondary);
  white-space: nowrap;
}

.clock-bar-horizontal.position-between .clock-time {
  font-size: 0.875rem;
}

.clock-bar-horizontal.position-between .clock-date {
  font-size: 0.75rem;
}

.clock-bar-outer {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 1rem;
}

.clock-bar-side {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.clock-bar-left {
  justify-content: flex-start;
}

.clock-bar-right {
  justify-content: flex-end;
}

.clock-bar-content {
  flex: 0 1 auto;
}

.clock-refresh-icon {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border: 1.5px solid var(--text-secondary);
  border-top-color: transparent;
  border-radius: 50%;
  margin: 0 0.5rem;
  animation: clock-spin 1s linear infinite;
  flex-shrink: 0;
}

@keyframes clock-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
