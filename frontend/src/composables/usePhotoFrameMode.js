import { ref, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { useRouter } from "vue-router";

/**
 * Composable for managing photo frame mode (auto full-screen after inactivity).
 * Uses singleton pattern to ensure only one instance exists across the app.
 */
let photoFrameInstance = null;
let globalInitialized = false; // Track initialization at module level

// Helper function to log only in development mode
const devLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export function usePhotoFrameMode() {
  // Return existing instance if already created
  if (photoFrameInstance) {
    devLog("[PhotoFrame] Returning existing singleton instance");
    return photoFrameInstance;
  }

  devLog("[PhotoFrame] Creating new singleton instance");

  const configStore = useConfigStore();
  const modeStore = useModeStore();
  const router = useRouter();

  const isPhotoFrameActive = ref(false);
  const inactivityTimer = ref(null);
  const lastActivityTime = ref(Date.now());
  const savedSideViewMode = ref(null); // Store side view mode before entering photo frame
  const resetTimerThrottle = ref(null); // Throttle for resetInactivityTimer calls
  const isResettingTimer = ref(false); // Flag to prevent concurrent timer resets

  const resetInactivityTimer = () => {
    // Prevent concurrent execution
    if (isResettingTimer.value) {
      return;
    }

    isResettingTimer.value = true;
    lastActivityTime.value = Date.now();

    // Clear throttle if it exists
    if (resetTimerThrottle.value) {
      clearTimeout(resetTimerThrottle.value);
      resetTimerThrottle.value = null;
    }

    // Check if we had an existing timer (for logging purposes)
    const hadExistingTimer = !!inactivityTimer.value;

    // Clear existing timer
    if (inactivityTimer.value) {
      clearTimeout(inactivityTimer.value);
      inactivityTimer.value = null;
    }

    // If photo frame is active, exit it
    if (isPhotoFrameActive.value) {
      isResettingTimer.value = false;
      exitPhotoFrameMode();
      return; // Don't start a new timer immediately after exiting
    }

    // Don't start timer if user is on settings page
    const currentPath = router.currentRoute.value.path;
    if (currentPath === "/settings") {
      isResettingTimer.value = false;
      return;
    }

    // Start new timer if photo frame mode is enabled
    if (configStore.photoFrameEnabled && !isPhotoFrameActive.value) {
      const timeout = configStore.photoFrameTimeout * 1000; // Convert to milliseconds

      // Only log when actually starting a new timer, not when resetting an existing one
      if (!hadExistingTimer) {
        devLog("[PhotoFrame] Starting inactivity timer:", timeout, "ms");
      }
      // Don't log resets to reduce noise - timer is silently reset on user activity

      inactivityTimer.value = setTimeout(() => {
        devLog("[PhotoFrame] Timer expired, entering photo frame mode");
        inactivityTimer.value = null; // Clear reference before entering
        enterPhotoFrameMode();
      }, timeout);
    }

    isResettingTimer.value = false;
  };

  const enterPhotoFrameMode = () => {
    if (!configStore.photoFrameEnabled) {
      devLog("[PhotoFrame] Cannot enter photo frame mode: disabled in config");
      return;
    }

    // Don't enter if user is on settings page
    const currentPath = router.currentRoute.value.path;
    if (currentPath === "/settings") {
      devLog(
        "[PhotoFrame] Cannot enter photo frame mode: user is on settings page",
      );
      return;
    }

    devLog("[PhotoFrame] Entering photo frame mode");

    // Save current side view mode before entering photo frame
    savedSideViewMode.value = configStore.lastSideViewMode;
    devLog("[PhotoFrame] Saved side view mode:", savedSideViewMode.value);

    // Enter fullscreen photos mode
    modeStore.enterFullscreen(modeStore.MODES.PHOTOS);
    isPhotoFrameActive.value = true;
    router.push("/");
  };

  const exitPhotoFrameMode = () => {
    if (!isPhotoFrameActive.value) return;

    devLog("[PhotoFrame] Exiting photo frame mode");

    // Exit fullscreen - return to dashboard
    modeStore.exitFullscreen();
    isPhotoFrameActive.value = false;
    router.push("/");

    // Restore saved side view mode
    if (savedSideViewMode.value !== null) {
      devLog("[PhotoFrame] Restoring side view mode:", savedSideViewMode.value);
      configStore.setLastSideViewMode(savedSideViewMode.value);
      savedSideViewMode.value = null;
    }

    // Reset inactivity timer
    resetInactivityTimer();
  };

  const handleActivity = () => {
    // Throttle activity handling to prevent excessive timer resets
    // Only process activity every 500ms to avoid creating hundreds of timers
    if (resetTimerThrottle.value) {
      return; // Already scheduled, skip this call
    }

    resetTimerThrottle.value = setTimeout(() => {
      resetInactivityTimer();
      resetTimerThrottle.value = null;
    }, 500); // Throttle to max once per 500ms
  };

  // Track if listeners are set up
  let listenersSetup = false;

  const setupEventListeners = () => {
    if (listenersSetup) {
      devLog("[PhotoFrame] Event listeners already set up, skipping");
      return;
    }

    // Set up activity listeners
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    listenersSetup = true;
    devLog("[PhotoFrame] Event listeners registered:", events);
  };

  const removeEventListeners = () => {
    if (!listenersSetup) return;

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
    events.forEach((event) => {
      window.removeEventListener(event, handleActivity);
    });

    listenersSetup = false;
    devLog("[PhotoFrame] Event listeners removed");
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
    { immediate: false }, // Don't run on initial setup, we handle that in onMounted
  );

  watch(
    () => configStore.photoFrameTimeout,
    () => {
      if (configStore.photoFrameEnabled) {
        resetInactivityTimer();
      }
    },
    { immediate: false }, // Don't run on initial setup, we handle that in onMounted
  );

  // Watch for route changes to prevent activation on settings page
  watch(
    () => router.currentRoute.value.path,
    (newPath, oldPath) => {
      // Clear timer if navigating to settings
      if (newPath === "/settings") {
        devLog("[PhotoFrame] User navigated to settings, clearing timer");
        if (inactivityTimer.value) {
          clearTimeout(inactivityTimer.value);
          inactivityTimer.value = null;
        }
      } else if (
        oldPath === "/settings" &&
        newPath === "/" &&
        configStore.photoFrameEnabled &&
        !isPhotoFrameActive.value
      ) {
        // Restart timer if navigating away from settings to dashboard and photo frame is enabled
        devLog(
          "[PhotoFrame] User navigated away from settings to dashboard, restarting timer",
        );
        // Only restart if we don't already have a timer
        if (!inactivityTimer.value) {
          resetInactivityTimer();
        }
      }
    },
  );

  // Initialize on first call (not tied to component lifecycle)
  const initialize = async () => {
    if (globalInitialized) {
      devLog("[PhotoFrame] Already initialized globally, skipping");
      return;
    }

    devLog("[PhotoFrame] Initializing photo frame mode...");
    globalInitialized = true;

    // Load config first to get photo frame settings from server
    await configStore.fetchConfig();

    devLog("[PhotoFrame] Config loaded:", {
      photoFrameEnabled: configStore.photoFrameEnabled,
      photoFrameTimeout: configStore.photoFrameTimeout,
    });

    // Set up activity listeners
    setupEventListeners();

    // Initialize timer if photo frame mode is enabled (loaded from server)
    // This ensures the setting from the server is properly applied
    if (configStore.photoFrameEnabled) {
      devLog(
        "[PhotoFrame] Initializing timer with timeout:",
        configStore.photoFrameTimeout,
      );
      resetInactivityTimer();
    } else {
      devLog("[PhotoFrame] Photo frame mode is disabled, not starting timer");
    }
  };

  // Only initialize once, on the first component that mounts
  // Subsequent components will get the singleton instance but won't re-initialize
  onMounted(async () => {
    // Only initialize if this is the first component mounting
    if (!globalInitialized) {
      await initialize();
    }
  });

  onUnmounted(() => {
    // Clean up
    if (inactivityTimer.value) {
      clearTimeout(inactivityTimer.value);
      inactivityTimer.value = null;
    }

    if (resetTimerThrottle.value) {
      clearTimeout(resetTimerThrottle.value);
      resetTimerThrottle.value = null;
    }

    removeEventListeners();
  });

  const instance = {
    isPhotoFrameActive,
    enterPhotoFrameMode,
    exitPhotoFrameMode,
    resetInactivityTimer,
  };

  // Store instance for singleton pattern
  photoFrameInstance = instance;

  return instance;
}
