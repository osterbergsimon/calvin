<template>
  <Transition name="hud">
    <div v-if="visible" class="hud" :class="[sizeClass, positionClass]">
      <span class="hud__lamp" aria-hidden="true" />
      <span v-if="notificationType === 'mode'" class="hud__glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path :d="iconPath" fill="currentColor" />
        </svg>
      </span>
      <span v-else class="hud__keycap">{{ keycap }}</span>
      <span class="hud__label">{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { mdiCalendarBlankOutline, mdiImageOutline, mdiWeb, mdiViewDashboardOutline } from "@mdi/js";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";

/**
 * Input-echo HUD.
 *
 * Confirms a physical keyboard/remote press and echoes mode changes while the
 * UI is hidden. Ephemeral and non-interactive by design — you're holding a
 * remote, not touching the glass. System-event toasts live on the StatusRail
 * (see stores/notifications.js); they do not pass through here.
 */

const configStore = useConfigStore();
const modeStore = useModeStore();

const visible = ref(false);
const notificationType = ref("keyboard"); // 'keyboard' | 'mode'
const keycap = ref("");
const iconPath = ref("");
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

const getModeIconPath = () => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) return mdiImageOutline;
    if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) return mdiWeb;
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) return mdiCalendarBlankOutline;
    if (modeStore.currentMode === modeStore.MODES.PHOTOS) return mdiImageOutline;
    if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) return mdiWeb;
  }
  return mdiViewDashboardOutline;
};

const getModeMessage = () => {
  if (modeStore.isFullscreen) {
    if (modeStore.fullscreenMode === modeStore.MODES.PHOTOS) return "Fullscreen Photos";
    if (modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES) return "Fullscreen Web Services";
  } else {
    if (modeStore.currentMode === modeStore.MODES.CALENDAR) return "Calendar Mode";
    if (modeStore.currentMode === modeStore.MODES.PHOTOS) return "Photos Mode";
    if (modeStore.currentMode === modeStore.MODES.WEB_SERVICES) return "Web Services Mode";
  }
  return "Dashboard";
};

const sizeClass = computed(() => `hud--${configStore.keyboardFeedbackMode || "normal"}`);

const positionClass = computed(() => {
  // "small" tucks bottom-centre (clear of the status rail); "normal" centres.
  return (configStore.keyboardFeedbackMode || "normal") === "small" ? "hud--bottom" : "hud--center";
});

let hideTimeout = null;

/**
 * @param {"keyboard"|"mode"} type
 * @param {string} iconValue  keycap text (keyboard) or MDI path (mode)
 * @param {string} messageValue
 * @param {number|null} duration
 */
const show = (type, iconValue, messageValue, duration = null) => {
  if (!configStore.keyboardFeedbackEnabled) return;

  notificationType.value = type;
  if (type === "mode") {
    iconPath.value = iconValue;
  } else {
    keycap.value = iconValue;
  }
  message.value = messageValue;
  visible.value = true;

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  let timeoutDuration;
  if (duration !== null) {
    timeoutDuration = duration;
  } else if (type === "mode") {
    const timeout = configStore.modeIndicatorTimeout || 0;
    timeoutDuration = timeout > 0 ? timeout * 1000 : 1500;
  } else {
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
  // Only surface the mode HUD when the UI chrome is hidden.
  if (configStore.shouldShowUI) return;
  show("mode", getModeIconPath(), getModeMessage());
};

watch(
  () => [modeStore.currentMode, modeStore.isFullscreen, modeStore.fullscreenMode],
  () => {
    showModeChange();
  },
  { immediate: false }
);

watch(
  () => configStore.keyboardFeedbackEnabled,
  enabled => {
    if (!enabled && visible.value) {
      visible.value = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  }
);

watch(
  () => configStore.shouldShowUI,
  showUI => {
    if (!showUI) {
      showModeChange();
    } else if (notificationType.value === "mode" && visible.value) {
      visible.value = false;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  }
);

defineExpose({
  show,
  showKeyboardFeedback,
  showModeChange,
});
</script>

<style scoped>
.hud {
  position: fixed;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem 0.5rem 0.65rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 6px 22px color-mix(in srgb, var(--ink) 18%, transparent);
  pointer-events: none;
  user-select: none;
  max-width: min(90vw, 22rem);
}

/* Positions */
.hud--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.hud--bottom {
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
}

/* Amber "power" lamp — the same instrument-panel motif, held quiet here. */
.hud__lamp {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 2px;
  background: var(--focus);
  box-shadow:
    0 0 6px 0 var(--focus),
    0 0 14px 1px var(--focus-glow);
}

/* Keycap — mono, tabular, boxed like a real key. */
.hud__keycap {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.4rem;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
}

.hud__glyph {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--focus);
}

.hud__label {
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Larger, calmer variant when the mode HUD holds centre-screen. */
.hud--normal {
  padding: 0.65rem 1rem 0.65rem 0.8rem;
  gap: 0.75rem;
}
.hud--normal .hud__keycap {
  min-width: 2.4rem;
  height: 2.4rem;
  font-size: var(--fs-lg);
}
.hud--normal .hud__glyph {
  width: 2rem;
  height: 2rem;
}
.hud--normal .hud__label {
  font-size: var(--fs-lg);
}

/* Motion */
.hud-enter-active {
  transition:
    opacity 0.25s ease-out,
    transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.hud-leave-active {
  transition:
    opacity 0.2s ease-in,
    transform 0.2s ease-in;
}
.hud--center.hud-enter-from,
.hud--center.hud-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.92);
}
.hud--bottom.hud-enter-from,
.hud--bottom.hud-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (prefers-reduced-motion: reduce) {
  .hud-enter-active,
  .hud-leave-active {
    transition: none;
  }
}
</style>
