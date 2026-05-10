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
    </div>

    <div class="clock-bar-middle">
      <div
        class="clock-bar-content"
        :class="{
          'layout-single-line': layout === 'single-line',
          'layout-two-lines': layout === 'two-lines',
          'layout-vertical-compact': isCompactLayout,
          'layout-compact-date': layout === 'compact-time-date',
        }"
      >
        <template v-if="isCompactLayout">
          <span class="clock-time compact-time" :style="{ fontSize: `${fontSize}px` }">
            <span>{{ compactTimeParts.hour }}</span>
            <span>{{ compactTimeParts.minute }}</span>
            <span v-if="compactTimeParts.second">{{ compactTimeParts.second }}</span>
            <span v-if="compactTimeParts.dayPeriod" class="compact-period">{{
              compactTimeParts.dayPeriod
            }}</span>
          </span>
          <span
            v-if="showDate && layout === 'compact-time-date' && compactDateParts"
            class="clock-date compact-date compact-date-stacked"
            :style="{ fontSize: `${dateFontSize}px` }"
          >
            <span v-if="compactDateParts.weekday">{{ compactDateParts.weekday }}</span>
            <span>
              {{ compactDateParts.day }}
              {{ compactDateParts.month }}
            </span>
            <span v-if="compactDateParts.year" class="compact-date-year">{{
              compactDateParts.year
            }}</span>
          </span>
          <span
            v-else-if="showDate"
            class="clock-date compact-date"
            :style="{ fontSize: `${dateFontSize}px` }"
          >
            {{ formattedDate }}
          </span>
        </template>
        <template v-else>
          <span class="clock-time" :style="{ fontSize: `${fontSize}px` }">{{ formattedTime }}</span>
          <span v-if="showDate" class="clock-date" :style="{ fontSize: `${dateFontSize}px` }">{{
            formattedDate
          }}</span>
        </template>
      </div>
    </div>

    <div class="clock-bar-bottom">
      <PluginStatusbarItems v-if="showStatusbar" orientation="vertical" />

      <BarActionCluster v-if="!previewMode" class="clock-bar-actions" :compact="true" />
    </div>
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
  compactTimeParts,
  formattedDate,
  compactDateParts,
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
  orientation: () => "vertical",
});

const configStore = useConfigStore();
const showLogo = computed(() => configStore.clockBarShowLogo !== false);
const isCompactLayout = computed(
  () => layout.value === "compact-time" || layout.value === "compact-time-date"
);
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
  align-items: stretch;
  gap: 0.75rem;
  position: relative;
  z-index: 100;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  min-height: 0;
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

.clock-bar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}

.clock-bar-middle {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 0;
}

.clock-bar-bottom {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  min-height: 0;
}

.clock-bar-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-family: "Courier New", monospace;
  white-space: nowrap;
  text-align: center;
}

.clock-bar-content.layout-two-lines {
  gap: 0.15rem;
}

.clock-bar-content.layout-vertical-compact {
  flex-direction: column;
  gap: 0.45rem;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
}

.compact-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  line-height: 0.92;
  font-variant-numeric: tabular-nums;
}

.compact-period {
  margin-top: 0.2rem;
  font-size: 0.45em;
  line-height: 1;
}

.compact-date {
  max-height: 35vh;
  writing-mode: vertical-rl;
  text-orientation: upright;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-date-stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  max-height: none;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.compact-date-year {
  font-size: 0.78em;
  color: var(--text-secondary);
}

.clock-time {
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.1;
}

.clock-date {
  color: var(--text-secondary);
  line-height: 1.1;
}

.clock-bar-vertical.position-between .clock-time {
  font-size: 0.875rem;
}

.clock-bar-vertical.position-between .clock-date {
  font-size: 0.75rem;
}

.clock-bar-actions {
  width: 100%;
  flex: 0 0 auto;
}
</style>
