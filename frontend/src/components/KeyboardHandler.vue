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
import NotificationSystem from "./NotificationSystem.vue";
import { showSystemRebootScheduled } from "../utils/systemNotifications";
import { useSystem } from "../composables/useSystem";
import { normalizeKeyCode } from "@/utils/keyCode";

const keyboardStore = useKeyboardStore();
const configStore = useConfigStore();
const { handleAction } = useKeyboardActions();
const { resetInactivityTimer } = usePhotoFrameMode();
const notificationRef = ref(null);

// Reboot combo tracking
const pressedKeys = new Set();
let rebootComboStartTime = null;
let rebootComboKeys = ["KEY_1", "KEY_7"]; // Will be loaded from config
let rebootComboDuration = 10000; // Will be loaded from config (10 seconds default)
let rebootComboCheckInterval = null;


const checkRebootCombo = () => {
  // Check if both reboot combo keys are pressed
  const comboKeysPressed = rebootComboKeys.every(key => pressedKeys.has(key));

  if (comboKeysPressed) {
    // Start tracking combo duration
    if (!rebootComboStartTime) {
      rebootComboStartTime = Date.now();
      console.log(`Reboot combo started (${rebootComboKeys.join(" + ")})...`);
    } else {
      // Check if combo has been held for required duration
      const elapsed = Date.now() - rebootComboStartTime;
      if (elapsed >= rebootComboDuration) {
        // Trigger reboot
        console.log(
          `Reboot combo held for ${rebootComboDuration / 1000} seconds - rebooting system`
        );
        triggerReboot();
        // Reset combo tracking
        rebootComboStartTime = null;
        pressedKeys.clear();
      }
    }
  } else {
    // Combo not complete, reset tracking
    if (rebootComboStartTime) {
      rebootComboStartTime = null;
    }
  }
};

const triggerReboot = async () => {
  try {
    const response = await fetch("/api/system/reboot", {
      method: "POST",
    });
    if (response.ok) {
      showSystemRebootScheduled(notificationRef);
    } else {
      console.error("Failed to trigger reboot:", await response.text());
    }
  } catch (error) {
    console.error("Error triggering reboot:", error);
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

  // Track pressed keys for reboot combo
  pressedKeys.add(keyCode);
  checkRebootCombo();

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

  // Reset reboot combo if any combo key is released
  if (rebootComboKeys.includes(keyCode)) {
    rebootComboStartTime = null;
  }
};

const loadKeyboardConfig = async () => {
  try {
    await keyboardStore.fetchMappings();
    // Load keyboard type from config API
    const response = await fetch("/api/config");
    if (response.ok) {
      const config = await response.json();
      // Load reboot combo settings
      if (config.rebootComboKey1 || config.reboot_combo_key1) {
        const key1 = config.rebootComboKey1 || config.reboot_combo_key1;
        const key2 = config.rebootComboKey2 || config.reboot_combo_key2 || "KEY_7";
        rebootComboKeys = [key1, key2];
      }
      if (config.rebootComboDuration !== undefined || config.reboot_combo_duration !== undefined) {
        rebootComboDuration = config.rebootComboDuration || config.reboot_combo_duration || 10000;
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

// Surface restart/update status as a toast so it's visible outside Settings
const { updateMessage, updateMessageClass } = useSystem();
const _msgClassToNotifType = {
  info: "info",
  success: "success",
  error: "error",
  warning: "warning",
};
const _msgClassToDuration = {
  info: 5000,
  success: 4000,
  error: 8000,
  warning: 8000,
};
const _msgClassToIcon = { info: "🔄", success: "✓", error: "✗", warning: "⚠" };
watch(updateMessage, msg => {
  if (!msg) return;
  const cls = updateMessageClass.value || "info";
  const type = _msgClassToNotifType[cls] ?? "info";
  notificationRef.value?.show(
    type,
    _msgClassToIcon[cls] ?? "🔄",
    msg,
    _msgClassToDuration[cls] ?? 5000
  );
});

onMounted(async () => {
  // Load keyboard mappings and config
  await loadKeyboardConfig();

  // Start keyboard config polling with configured interval
  startKeyboardConfigPolling();

  // Add global keyboard listeners
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Start checking reboot combo periodically
  rebootComboCheckInterval = setInterval(checkRebootCombo, 100); // Check every 100ms
});

onUnmounted(() => {
  // Remove keyboard listeners
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);

  // Clean up intervals
  if (keyboardConfigInterval) {
    clearInterval(keyboardConfigInterval);
    keyboardConfigInterval = null;
  }
  if (rebootComboCheckInterval) {
    clearInterval(rebootComboCheckInterval);
    rebootComboCheckInterval = null;
  }
});
</script>
