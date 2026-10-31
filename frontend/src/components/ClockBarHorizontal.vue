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
        <PluginStatusbarItems :size="pluginItemSize" />
        <BarActionCluster v-if="!previewMode" :compact="false" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { useClockBar } from "../composables/useClockBar";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { getActiveDashboardScreen } from "../utils/layout";
import { getKioskId } from "../utils/kioskId";
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
const screensConfig = computed(() => configStore.effectiveDashboardScreens);
const screens = computed(() => screensConfig.value.screens);
const activeScreenId = computed(() => getActiveDashboardScreen(screensConfig.value)?.id ?? null);

// The room name is a screen's own Name (its displayName override), never a
// global value: a browser that is not a known screen shows nothing, and an
// unnamed screen shows nothing here too (CLV-84). The screen's card falls back
// to its hostname; the clock bar does not.
const kioskId = getKioskId();
const kiosksStore = useKiosksStore();
const roomLabel = computed(() => {
  if (!kioskId) return "";
  const self = kiosksStore.kiosks.find(kiosk => kiosk.id === kioskId);
  return self?.overrides?.displayName || "";
});

onMounted(() => {
  if (kioskId) kiosksStore.loadKiosks();
});
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
  /* Above the dashboard stage (--z-sticky + 1) so the bar never sits under a
     region's focus glow. */
  z-index: calc(var(--z-sticky) * 2);
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
  z-index: var(--z-sticky);
  border: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  border-radius: var(--radius-control);
}

.clock-bar-content {
  display: flex;
  align-items: center;
  gap: var(--gap-4);
}

.clock-bar-content.layout-two-lines {
  flex-direction: column;
  gap: var(--gap-1);
  align-items: center;
}

.clock-time {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: var(--weight-title);
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
  font-size: var(--text-body);
}

/* On a phone the bar cannot hold the wordmark, the room, the clock, the
   connection pill and the ⋯ menu on one line: the row ran past the screen and
   scrolled sideways, cutting the clock (CLV-66). The room name is the least
   load-bearing piece there and still shows in Settings. */
@media (max-width: 600px) {
  .clock-bar-horizontal .clock-bar-room {
    display: none;
  }
  /* Screen dots are 44px touch targets each and cannot shrink; at 390px they
     ran under the centred time ("●15:31"). Below the phone breakpoint the dots
     give way so the clock keeps its own room. */
  .clock-bar-horizontal .screen-dots {
    display: none;
  }
  .clock-bar-outer {
    gap: var(--gap-2);
  }
}

.clock-bar-horizontal.position-between .clock-time {
  font-size: var(--text-body);
}

.clock-bar-horizontal.position-between .clock-date {
  font-size: var(--text-caption);
}

.clock-bar-outer {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--gap-4);
  min-width: 0;
}

.clock-bar-side {
  flex: 1;
  display: flex;
  align-items: center;
  /* One spacing token for both sides: the wordmark, room name and screen dots
     (left) and the plugin tiles and actions (right) never touch. */
  gap: var(--gap-inline);
  min-width: 0;
}

.clock-bar-left {
  justify-content: flex-start;
}

.clock-bar-right {
  justify-content: flex-end;
}

.clock-bar-content {
  /* The centred clock keeps its full width: the side groups yield instead of
     the time being squeezed under the screen dots (CLV-91). */
  flex: 0 0 auto;
  min-width: 0;
}
</style>
