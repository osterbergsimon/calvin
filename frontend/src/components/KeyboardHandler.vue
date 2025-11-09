<template>
  <div style="display: none">
    <!-- This component handles keyboard events globally -->
    <span />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";
import { useKeyboardStore } from "../stores/keyboard";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { usePhotoFrameMode } from "../composables/usePhotoFrameMode";

const keyboardStore = useKeyboardStore();
const { handleAction } = useKeyboardActions();
const { resetInactivityTimer } = usePhotoFrameMode();

// Reboot combo tracking
const pressedKeys = new Set();
let rebootComboStartTime = null;
let rebootComboKeys = ["KEY_1", "KEY_7"]; // Will be loaded from config
let rebootComboDuration = 10000; // Will be loaded from config (10 seconds default)
let rebootComboCheckInterval = null;

// Map browser key codes to our key codes
const keyCodeMap = {
  ArrowRight: "KEY_RIGHT",
  ArrowLeft: "KEY_LEFT",
  ArrowUp: "KEY_UP",
  ArrowDown: "KEY_DOWN",
  Space: "KEY_SPACE",
  Enter: "KEY_ENTER",
  Escape: "KEY_ESCAPE",
  Home: "KEY_HOME",
  End: "KEY_END",
  PageUp: "KEY_PAGEUP",
  PageDown: "KEY_PAGEDOWN",
  Digit1: "KEY_1",
  Digit2: "KEY_2",
  Digit3: "KEY_3",
  Digit4: "KEY_4",
  Digit5: "KEY_5",
  Digit6: "KEY_6",
  Digit7: "KEY_7",
  KeyS: "KEY_S",
};

const checkRebootCombo = () => {
  // Check if both reboot combo keys are pressed
  const comboKeysPressed = rebootComboKeys.every((key) => pressedKeys.has(key));
  
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
        console.log(`Reboot combo held for ${rebootComboDuration / 1000} seconds - rebooting system`);
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
      console.log("Reboot command sent successfully");
      // Show a message (if possible before reboot)
      alert("System rebooting in 3 seconds...");
    } else {
      console.error("Failed to trigger reboot:", await response.text());
    }
  } catch (error) {
    console.error("Error triggering reboot:", error);
  }
};

const onKeyDown = async (event) => {
  // Don't handle if user is typing in an input/textarea
  if (
    event.target.tagName === "INPUT" ||
    event.target.tagName === "TEXTAREA" ||
    event.target.isContentEditable
  ) {
    return;
  }

  // Map browser key to our key code
  const keyCode = keyCodeMap[event.code] || event.code;

  // Track pressed keys for reboot combo
  pressedKeys.add(keyCode);
  checkRebootCombo();

  // Get keyboard type from store
  const keyboardType = keyboardStore.keyboardType || "7-button";

  // Get mappings for current keyboard type
  // Mappings structure: { "7-button": { "KEY_1": "action" }, "standard": { ... } }
  const mappings = keyboardStore.mappings[keyboardType] || {};

  // Find action for this key
  const action = mappings[keyCode];

  if (action && action !== "none") {
    event.preventDefault();
    // Reset inactivity timer on any keyboard action
    resetInactivityTimer();
    handleAction(action);
  } else {
    // Even if no mapped action, reset timer on any keypress
    resetInactivityTimer();
  }
};

const onKeyUp = (event) => {
  // Map browser key to our key code
  const keyCode = keyCodeMap[event.code] || event.code;
  
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
      if (config.keyboardType || config.keyboard_type) {
        keyboardStore.setKeyboardType(config.keyboardType || config.keyboard_type);
      }
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

onMounted(async () => {
  // Load keyboard mappings and config
  await loadKeyboardConfig();
  
  // Poll for keyboard config updates (every 30 seconds, same as dashboard config polling)
  // This allows keyboard settings changed from another device to take effect
  const keyboardConfigInterval = setInterval(async () => {
    await loadKeyboardConfig();
  }, 30000);

  // Add global keyboard listeners
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  
  // Start checking reboot combo periodically
  rebootComboCheckInterval = setInterval(checkRebootCombo, 100); // Check every 100ms
  
  // Clean up interval on unmount
  onUnmounted(() => {
    clearInterval(keyboardConfigInterval);
    if (rebootComboCheckInterval) {
      clearInterval(rebootComboCheckInterval);
    }
  });
});

onUnmounted(() => {
  // Remove keyboard listeners
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  if (rebootComboCheckInterval) {
    clearInterval(rebootComboCheckInterval);
  }
});
</script>
