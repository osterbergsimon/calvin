<template>
  <div style="display: none">
    <!-- This component handles keyboard events globally -->
    <span />
  </div>
  <NotificationSystem ref="notificationRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useKeyboardStore } from "../stores/keyboard";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { usePhotoFrameMode } from "../composables/usePhotoFrameMode";
import { useConfigStore } from "../stores/config";
import { useNotificationsStore } from "../stores/notifications";
import NotificationSystem from "./NotificationSystem.vue";
import { showSystemRebootFailed, showSystemRebootScheduled } from "../utils/systemNotifications";
import { detailMessage } from "../utils/apiErrors";
import { useSystem } from "../composables/useSystem";
import { normalizeKeyCode } from "@/utils/keyCode";
import { configUrl } from "@/utils/kioskId";
import api from "@/services/api";

const keyboardStore = useKeyboardStore();
const configStore = useConfigStore();
const notificationsStore = useNotificationsStore();
const { handleAction } = useKeyboardActions();
const { resetInactivityTimer } = usePhotoFrameMode();
const notificationRef = ref(null);

// Reboot combo tracking. This is a host action, so be strict: only a fresh,
// non-repeat transition arms it, and once fired it stays latched until every
// combo key has been released.
const pressedKeys = new Set();
let rebootComboKeys = ["KEY_1", "KEY_7"]; // Will be loaded from config
let rebootComboDuration = 10000; // Will be loaded from config (10 seconds default)
let rebootComboTimer = null;
let rebootComboFired = false;

const comboKeysAllDown = () => rebootComboKeys.every(key => pressedKeys.has(key));
const anyComboKeyPressed = () => rebootComboKeys.some(key => pressedKeys.has(key));

const cancelArmedRebootCombo = () => {
  if (rebootComboTimer) {
    clearTimeout(rebootComboTimer);
    rebootComboTimer = null;
  }
};

const resetRebootCombo = () => {
  cancelArmedRebootCombo();
  pressedKeys.clear();
  rebootComboFired = false;
};

// Arm on the transition to "all combo keys down" only; repeats never call this.
const armRebootCombo = () => {
  if (rebootComboFired || rebootComboTimer || !comboKeysAllDown()) return;
  console.log(`Reboot combo started (${rebootComboKeys.join(" + ")})...`);
  rebootComboTimer = setTimeout(() => {
    rebootComboTimer = null;
    rebootComboFired = true;
    console.log(`Reboot combo held for ${rebootComboDuration / 1000} seconds - rebooting system`);
    triggerReboot();
  }, rebootComboDuration);
};

const triggerReboot = async () => {
  try {
    // The shared client is required: a 401 admin_required opens the in-place
    // sign-in dialog here (CLV-9 §7), which a bare fetch() would bypass.
    await api.post("/system/reboot");
    showSystemRebootScheduled(notificationsStore);
  } catch (error) {
    // A 401 admin_required has already opened the in-place sign-in dialog via
    // the shared client's interceptor; don't also report a failure.
    if (error?.adminRequired) return;
    // A refused reboot (e.g. 409 host_control_disabled) carries the reason the
    // user needs; a generic "failed" would hide it.
    const detail = error?.response?.data?.detail;
    showSystemRebootFailed(notificationsStore, detailMessage(detail, ""));
    console.error("Failed to trigger reboot:", detail ?? error?.message ?? error);
  }
};

const onKeyDown = async event => {
  // Don't handle if user is typing in an input/textarea
  if (
    event.target.tagName === "INPUT" ||
    event.target.tagName === "TEXTAREA" ||
    event.target.isContentEditable
  ) {
    return;
  }

  const keyCode = normalizeKeyCode(event);

  // Capture mode (settings remap): swallow the key, bind it, dispatch nothing.
  if (keyboardStore.captureActive) {
    event.preventDefault();
    keyboardStore.handleCaptureKey(keyCode);
    return;
  }

  // Track pressed keys for the reboot combo. Repeated keydowns are ignored:
  // they must not re-add keys cleared by a reset or re-arm a fired combo.
  if (!event.repeat) {
    const wasAllDown = comboKeysAllDown();
    pressedKeys.add(keyCode);
    if (!wasAllDown && comboKeysAllDown()) armRebootCombo();
  }

  // Find action for this key (single unified map)
  const mappings = keyboardStore.mappings || {};
  const action = mappings[keyCode];

  if (action && action !== "none") {
    event.preventDefault();
    // Reset inactivity timer on any keyboard action
    resetInactivityTimer();
    // Show visual feedback
    if (notificationRef.value) {
      notificationRef.value.showKeyboardFeedback(keyCode, action);
    }
    handleAction(action);
  } else {
    // Even if no mapped action, reset timer on any keypress
    resetInactivityTimer();
  }
};

const onKeyUp = event => {
  const keyCode = normalizeKeyCode(event);

  // Remove from pressed keys
  pressedKeys.delete(keyCode);

  // Any release breaks "all combo keys down"; clear the armed timer.
  if (!comboKeysAllDown()) cancelArmedRebootCombo();
  // The fired latch clears only after every combo key has been released.
  if (!anyComboKeyPressed()) rebootComboFired = false;
};

let lastKeyboardConfigSignature = null;

const loadKeyboardConfig = async () => {
  try {
    await keyboardStore.fetchMappings();
    // Load reboot-combo settings from config API (the kiosk's effective config on a kiosk)
    const response = await fetch(configUrl());
    if (response.ok) {
      const config = await response.json();
      const signature = JSON.stringify(config ?? null);
      if (signature === lastKeyboardConfigSignature) return;
      lastKeyboardConfigSignature = signature;
      // Load reboot combo settings. A change while a combo is armed cancels
      // the pending reboot; a fresh hold is required under the new settings.
      let nextKeys = rebootComboKeys;
      if (config.rebootComboKey1 || config.reboot_combo_key1) {
        const key1 = config.rebootComboKey1 || config.reboot_combo_key1;
        const key2 = config.rebootComboKey2 || config.reboot_combo_key2 || "KEY_7";
        nextKeys = [key1, key2];
      }
      let nextDuration = rebootComboDuration;
      if (config.rebootComboDuration !== undefined || config.reboot_combo_duration !== undefined) {
        nextDuration = config.rebootComboDuration || config.reboot_combo_duration || 10000;
      }
      if (
        nextKeys[0] !== rebootComboKeys[0] ||
        nextKeys[1] !== rebootComboKeys[1] ||
        nextDuration !== rebootComboDuration
      ) {
        cancelArmedRebootCombo();
        rebootComboKeys = nextKeys;
        rebootComboDuration = nextDuration;
      }
    }
  } catch (error) {
    console.error("Failed to load keyboard mappings:", error);
  }
};

let keyboardConfigInterval = null;

const startKeyboardConfigPolling = () => {
  // Clear existing interval if any
  if (keyboardConfigInterval) {
    clearInterval(keyboardConfigInterval);
    keyboardConfigInterval = null;
  }

  // Get polling interval from config (convert seconds to milliseconds)
  const intervalMs = configStore.configPollInterval * 1000;

  // Poll for keyboard config updates
  // This allows keyboard settings changed from another device to take effect
  keyboardConfigInterval = setInterval(async () => {
    await loadKeyboardConfig();
  }, intervalMs);
};

// Watch for changes to configPollInterval and restart polling
watch(
  () => configStore.configPollInterval,
  () => {
    startKeyboardConfigPolling();
  }
);

// Surface restart/update status on the status rail so it's visible outside Settings
const { updateMessage, updateMessageClass } = useSystem();
const _msgClassToSeverity = {
  info: "info",
  success: "success",
  error: "error",
  warning: "warning",
};
watch(updateMessage, msg => {
  if (!msg) return;
  const severity = _msgClassToSeverity[updateMessageClass.value] ?? "info";
  notificationsStore.notify({ severity, eyebrow: "System", message: msg });
});

// A lost keyup (focus change, tab hidden, page teardown) must never leave a
// host reboot armed.
const onWindowBlur = () => resetRebootCombo();
const onVisibilityChange = () => {
  if (document.visibilityState === "hidden") resetRebootCombo();
};
const onPageHide = () => resetRebootCombo();

onMounted(async () => {
  // Load keyboard mappings and config
  await loadKeyboardConfig();

  // Start keyboard config polling with configured interval
  startKeyboardConfigPolling();

  // Add global keyboard listeners
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);
});

onUnmounted(() => {
  // Remove keyboard listeners
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener("visibilitychange", onVisibilityChange);

  // Clean up intervals
  if (keyboardConfigInterval) {
    clearInterval(keyboardConfigInterval);
    keyboardConfigInterval = null;
  }
  resetRebootCombo();
});
</script>
