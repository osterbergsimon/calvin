<template>
  <div
    v-if="shouldShow"
    class="clock-bar-vertical"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: `${barPadding}px` }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div class="clock-bar-top">
      <BarLogo v-if="showLogo" />

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

      <PluginStatusbarItems v-if="showStatusbar" orientation="vertical" />
    </div>

    <BarActionCluster v-if="!previewMode" class="clock-bar-actions" :compact="true" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useClockBar } from "../composables/useClockBar";
import { useConfigStore } from "../stores/config";
import BarActionCluster from "./BarActionCluster.vue";
import BarLogo from "./BarLogo.vue";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";

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

const {
  shouldShow,
  showDate,
  showStatusbar,
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

const configStore = useConfigStore();
const showLogo = computed(() => configStore.clockBarShowLogo !== false);
</script>

<style scoped>
.clock-bar-vertical {
  height: 100%;
  width: auto;
  min-width: fit-content;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  z-index: 100;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
}

.clock-bar-vertical.position-right {
  border-left: 1px solid var(--border-color);
  border-right: none;
}

.clock-bar-vertical.position-between {
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
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

.clock-bar-vertical.position-between .clock-time {
  font-size: 0.875rem;
}

.clock-bar-vertical.position-between .clock-date {
  font-size: 0.75rem;
}

.clock-bar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.clock-bar-actions {
  width: 100%;
}
</style>
