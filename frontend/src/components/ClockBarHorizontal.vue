<template>
  <div
    v-if="shouldShow"
    class="clock-bar-horizontal"
    :class="[`position-${position}`, { 'show-date': showDate }]"
    :style="{ padding: barPaddingStyle }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div class="clock-bar-outer">
      <div class="clock-bar-side clock-bar-left">
        <BarLogo v-if="showLogo" />
        <span v-if="!previewMode && roomLabel" class="clock-bar-room">{{ roomLabel }}</span>
        <ScreenDots
          v-if="!previewMode"
          :screens="screens"
          :active-screen-id="activeScreenId"
          @select-screen="activateScreen"
        />
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
        <PluginStatusbarItems v-if="showStatusbar" :size="pluginItemSize" />
        <BarActionCluster v-if="!previewMode" :compact="false" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useConfigStore } from "../stores/config";
import { useClockBar } from "../composables/useClockBar";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { normalizeDashboardScreens, getActiveDashboardScreen } from "../utils/layout";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";
import BarActionCluster from "./BarActionCluster.vue";
import BarLogo from "./BarLogo.vue";
import ScreenDots from "./ui/ScreenDots.vue";

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
  previewPluginItemSize: {
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
  pluginItemSize,
  layout,
  barPaddingStyle,
} = useClockBar({
  enabled: () => props.enabled,
  showInKiosk: () => props.showInKiosk,
  showInNonKiosk: () => props.showInNonKiosk,
  previewMode: () => props.previewMode,
  previewTimeSize: () => props.previewTimeSize,
  previewDateSize: () => props.previewDateSize,
  previewLayout: () => props.previewLayout,
  previewPadding: () => props.previewPadding,
  previewPluginItemSize: () => props.previewPluginItemSize,
  orientation: () => "horizontal",
});

const configStore = useConfigStore();
const showLogo = computed(() => configStore.clockBarShowLogo !== false);

const { activateScreen } = useKeyboardActions();
const screensConfig = computed(() => normalizeDashboardScreens(configStore.dashboardScreens));
const screens = computed(() => screensConfig.value.screens);
const activeScreenId = computed(() => getActiveDashboardScreen(screensConfig.value)?.id ?? null);
const roomLabel = computed(() => configStore.displayName);
</script>

<style scoped>
.clock-bar-horizontal {
  width: 100%;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 200;
  user-select: none;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 0;
}

.clock-bar-horizontal.position-bottom {
  border-top: 1px solid var(--line);
  border-bottom: none;
}

.clock-bar-horizontal.position-between {
  z-index: 100;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.clock-bar-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.clock-bar-content.layout-two-lines {
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
}

.clock-time {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.clock-date {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink-2);
  white-space: nowrap;
}

.clock-bar-room {
  font-family: var(--font-ui);
  color: var(--ink-3);
  font-size: 0.95rem;
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
  min-width: 0;
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
  /* Keep plugin statusbar items from crowding the ⋯ action cluster. */
  gap: 0.5rem;
}

.clock-bar-content {
  flex: 0 1 auto;
  min-width: 0;
}
</style>
