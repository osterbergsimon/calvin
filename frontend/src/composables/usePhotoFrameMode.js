import { ref, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { useRouter } from "vue-router";

/**
 * Composable for managing photo frame mode (auto full-screen after inactivity).
 */
export function usePhotoFrameMode() {
  const configStore = useConfigStore();
  const modeStore = useModeStore();
  const router = useRouter();

  const isPhotoFrameActive = ref(false);
  const inactivityTimer = ref(null);
  const lastActivityTime = ref(Date.now());

  const resetInactivityTimer = () => {
    lastActivityTime.value = Date.now();

    // Clear existing timer
    if (inactivityTimer.value) {
      clearTimeout(inactivityTimer.value);
      inactivityTimer.value = null;
    }

    // If photo frame is active, exit it
    if (isPhotoFrameActive.value) {
      exitPhotoFrameMode();
    }

    // Start new timer if photo frame mode is enabled
    if (configStore.photoFrameEnabled && !isPhotoFrameActive.value) {
      const timeout = configStore.photoFrameTimeout * 1000; // Convert to milliseconds
      inactivityTimer.value = setTimeout(() => {
        enterPhotoFrameMode();
      }, timeout);
    }
  };

  const enterPhotoFrameMode = () => {
    if (!configStore.photoFrameEnabled) return;

    // Enter fullscreen photos mode
    modeStore.enterFullscreen(modeStore.MODES.PHOTOS);
    isPhotoFrameActive.value = true;
    router.push("/");
  };

  const exitPhotoFrameMode = () => {
    if (!isPhotoFrameActive.value) return;

    // Exit fullscreen - return to dashboard
    modeStore.exitFullscreen();
    isPhotoFrameActive.value = false;
    router.push("/");

    // Reset inactivity timer
    resetInactivityTimer();
  };

  const handleActivity = () => {
    resetInactivityTimer();
  };

  // Watch for config changes
  watch(
    () => configStore.photoFrameEnabled,
    (enabled) => {
      if (enabled) {
        resetInactivityTimer();
      } else {
        // Disable photo frame mode
        if (inactivityTimer.value) {
          clearTimeout(inactivityTimer.value);
          inactivityTimer.value = null;
        }
        if (isPhotoFrameActive.value) {
          exitPhotoFrameMode();
        }
      }
    },
  );

  watch(
    () => configStore.photoFrameTimeout,
    () => {
      if (configStore.photoFrameEnabled) {
        resetInactivityTimer();
      }
    },
  );

  onMounted(async () => {
    // Load config first to get photo frame settings
    await configStore.fetchConfig();

    // Set up activity listeners
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Initialize timer if photo frame mode is enabled
    if (configStore.photoFrameEnabled) {
      resetInactivityTimer();
    }
  });

  onUnmounted(() => {
    // Clean up
    if (inactivityTimer.value) {
      clearTimeout(inactivityTimer.value);
    }

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
    events.forEach((event) => {
      window.removeEventListener(event, handleActivity);
    });
  });

  return {
    isPhotoFrameActive,
    enterPhotoFrameMode,
    exitPhotoFrameMode,
    resetInactivityTimer,
  };
}
