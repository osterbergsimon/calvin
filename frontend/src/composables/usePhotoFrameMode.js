import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { useImagesStore } from "../stores/images";
import { useModeStore } from "../stores/mode";
import { useScreenSetting } from "./useScreenSetting";
import { useRouter } from "vue-router";

/**
 * Composable for managing photo frame mode (auto full-screen after inactivity).
 * Uses singleton pattern to ensure only one instance exists across the app.
 *
 * Photo frame is per screen (calvin-3xz9): Off/On, the idle wait and the photo
 * sources come from `useScreenSetting`, so a kiosk's override or this browser's
 * own choice applies while the old global config stays the fallback.
 */
let photoFrameInstance = null;
let globalInitialized = false; // Track initialization at module level

// The wake event itself must not reach the slideshow or the dashboard under it
// (a tap on a photo, Escape, an arrow key). The trailing click of a tap is
// swallowed for the same short window the hot-corner reveal uses.
const CLICK_SUPPRESS_MS = 700;
const WAKE_EVENTS = new Set(["pointerdown", "mousedown", "touchstart", "keydown"]);
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "pointerdown", "click"];

// Helper function to log only in development mode
const devLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

const asBool = value => value === true || value === "true" || value === 1 || value === "1";

const normalizeSourceIds = ids =>
  Array.isArray(ids)
    ? [
        ...new Set(ids.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())),
      ].sort()
    : [];

// Export reset function for testing
export function resetPhotoFrameInstance() {
  if (photoFrameInstance) {
    // Clean up any timers
    if (photoFrameInstance.inactivityTimer?.value) {
      clearTimeout(photoFrameInstance.inactivityTimer.value);
    }
    if (photoFrameInstance.resetTimerThrottle?.value) {
      clearTimeout(photoFrameInstance.resetTimerThrottle.value);
    }
    photoFrameInstance.removeEventListeners?.();
  }
  photoFrameInstance = null;
  globalInitialized = false;
}

export function usePhotoFrameMode() {
  // Return existing instance if already created
  if (photoFrameInstance) {
    devLog("[PhotoFrame] Returning existing singleton instance");
    return photoFrameInstance;
  }

  devLog("[PhotoFrame] Creating new singleton instance");

  const configStore = useConfigStore();
  const imagesStore = useImagesStore();
  const modeStore = useModeStore();
  const router = useRouter();

  // Per-screen settings. `serialize`/`parse` keep booleans, numbers and lists
  // intact in localStorage (the default string form would turn `false` truthy).
  const enabledSetting = useScreenSetting("photoFrameEnabled", {
    serverValue: () => configStore.photoFrameEnabled,
    serialize: JSON.stringify,
    parse: JSON.parse,
  });
  const timeoutSetting = useScreenSetting("photoFrameTimeout", {
    serverValue: () => configStore.photoFrameTimeout,
    serialize: JSON.stringify,
    parse: JSON.parse,
  });
  const sourceIdsSetting = useScreenSetting("photoFrameSourceIds", {
    serverValue: () => configStore.photoFrameSourceIds,
    serialize: JSON.stringify,
    parse: JSON.parse,
  });

  const photoFrameEnabled = computed(() => asBool(enabledSetting.value.value));
  const photoFrameTimeout = computed(() => {
    const seconds = Number(timeoutSetting.value.value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
  });
  const photoFrameSourceIds = computed(() => normalizeSourceIds(sourceIdsSetting.value.value));

  const isPhotoFrameActive = ref(false);
  const inactivityTimer = ref(null);
  const lastActivityTime = ref(Date.now());
  const savedSideViewMode = ref(null); // Store side view mode before entering photo frame
  const resetTimerThrottle = ref(null); // Throttle for resetInactivityTimer calls
  const isResettingTimer = ref(false); // Flag to prevent concurrent timer resets

  // Invalidates an in-flight "does this source have photos?" check when the
  // user acts or the settings change before it resolves.
  let enterToken = 0;

  const resetInactivityTimer = () => {
    // Prevent concurrent execution
    if (isResettingTimer.value) {
      return;
    }

    isResettingTimer.value = true;
    lastActivityTime.value = Date.now();
    enterToken += 1;

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
      exitPhotoFrameMode();
      isResettingTimer.value = false;
      return; // Don't start a new timer immediately after exiting
    }

    // Don't start timer if user is on settings page
    const currentPath = router.currentRoute.value.path;
    if (currentPath === "/settings") {
      isResettingTimer.value = false;
      return;
    }

    // Start new timer if photo frame mode is enabled
    if (photoFrameEnabled.value && !isPhotoFrameActive.value) {
      const timeout = photoFrameTimeout.value * 1000; // Convert to milliseconds

      // Only log when actually starting a new timer, not when resetting an existing one
      if (!hadExistingTimer) {
        devLog("[PhotoFrame] Starting inactivity timer:", timeout, "ms");
      }
      // Don't log resets to reduce noise - timer is silently reset on user activity

      inactivityTimer.value = setTimeout(() => {
        devLog("[PhotoFrame] Timer expired, entering photo frame mode");
        inactivityTimer.value = null; // Clear reference before entering
        enterPhotoFrameMode().catch(error => {
          devLog("[PhotoFrame] Could not enter photo frame mode:", error);
        });
      }, timeout);
    }

    isResettingTimer.value = false;
  };

  const enterPhotoFrameMode = async () => {
    if (!photoFrameEnabled.value) {
      devLog("[PhotoFrame] Cannot enter photo frame mode: disabled in config");
      return false;
    }

    // Don't enter if user is on settings page
    const currentPath = router.currentRoute.value.path;
    if (currentPath === "/settings") {
      devLog("[PhotoFrame] Cannot enter photo frame mode: user is on settings page");
      return false;
    }

    // A screen whose chosen sources have no photos stays on the dashboard
    // instead of opening an empty fullscreen slideshow (calvin-3xz9).
    const sourceIds = photoFrameSourceIds.value;
    const token = ++enterToken;
    try {
      await imagesStore.fetchImages(sourceIds);
    } catch (error) {
      devLog("[PhotoFrame] Could not load photos, staying on the dashboard:", error);
      return false;
    }
    if (token !== enterToken || isPhotoFrameActive.value) {
      // The user acted (or the settings changed) while we checked.
      return false;
    }
    if (!imagesStore.getImagesForSource(sourceIds).length) {
      devLog("[PhotoFrame] No photos in the chosen sources, staying on the dashboard");
      return false;
    }

    devLog("[PhotoFrame] Entering photo frame mode");

    // Save current side view mode before entering photo frame
    savedSideViewMode.value = configStore.lastSideViewMode;
    devLog("[PhotoFrame] Saved side view mode:", savedSideViewMode.value);

    // Enter fullscreen photos mode, scoped to this screen's chosen sources
    // (an empty list means all sources).
    modeStore.enterFullscreen(modeStore.MODES.PHOTOS, { sourceIds });
    isPhotoFrameActive.value = true;
    router.push("/");
    return true;
  };

  const exitPhotoFrameMode = () => {
    if (!isPhotoFrameActive.value) return;

    devLog("[PhotoFrame] Exiting photo frame mode");

    enterToken += 1;
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

  let suppressClicksUntil = 0;

  const swallow = event => {
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  // One capture-phase handler: while the frame is up, the first touch/key wakes
  // it and is swallowed, so it does not also act on the slideshow or the
  // dashboard that appears underneath.
  const handleWindowEvent = event => {
    // The tap that woke the frame still produces a click after the frame has
    // closed; swallow that one too so it cannot press a dashboard control.
    if (event.type === "click" && Date.now() < suppressClicksUntil) {
      suppressClicksUntil = 0;
      swallow(event);
      return;
    }
    if (isPhotoFrameActive.value) {
      if (WAKE_EVENTS.has(event.type)) {
        swallow(event);
        if (event.type !== "keydown") {
          suppressClicksUntil = Date.now() + CLICK_SUPPRESS_MS;
        }
        exitPhotoFrameMode();
        return;
      }
    }
    handleActivity();
  };

  // Track if listeners are set up
  let listenersSetup = false;

  const setupEventListeners = () => {
    if (listenersSetup) {
      devLog("[PhotoFrame] Event listeners already set up, skipping");
      return;
    }

    // Capture phase so the wake event can be swallowed before the slideshow or
    // dashboard sees it.
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleWindowEvent, { capture: true, passive: false });
    });

    listenersSetup = true;
    devLog("[PhotoFrame] Event listeners registered:", ACTIVITY_EVENTS);
  };

  const removeEventListeners = () => {
    if (!listenersSetup) return;

    ACTIVITY_EVENTS.forEach(event => {
      window.removeEventListener(event, handleWindowEvent, { capture: true });
    });

    listenersSetup = false;
    devLog("[PhotoFrame] Event listeners removed");
  };

  // Watch for per-screen setting changes
  watch(
    photoFrameEnabled,
    enabled => {
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
    { immediate: false } // Don't run on initial setup, we handle that in onMounted
  );

  watch(
    photoFrameTimeout,
    () => {
      if (photoFrameEnabled.value) {
        resetInactivityTimer();
      }
    },
    { immediate: false } // Don't run on initial setup, we handle that in onMounted
  );

  watch(
    photoFrameSourceIds,
    () => {
      if (photoFrameEnabled.value) {
        resetInactivityTimer();
      }
    },
    { immediate: false, deep: true }
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
        photoFrameEnabled.value &&
        !isPhotoFrameActive.value
      ) {
        // Restart timer if navigating away from settings to dashboard and photo frame is enabled
        devLog("[PhotoFrame] User navigated away from settings to dashboard, restarting timer");
        // Only restart if we don't already have a timer
        if (!inactivityTimer.value) {
          resetInactivityTimer();
        }
      }
    }
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
      photoFrameEnabled: photoFrameEnabled.value,
      photoFrameTimeout: photoFrameTimeout.value,
      photoFrameSourceIds: photoFrameSourceIds.value,
    });

    // Set up activity listeners
    setupEventListeners();

    // Initialize timer if photo frame mode is enabled (loaded from server)
    // This ensures the setting from the server is properly applied
    if (photoFrameEnabled.value) {
      devLog("[PhotoFrame] Initializing timer with timeout:", photoFrameTimeout.value);
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
    // Per-screen values, exposed for the settings row and tests.
    photoFrameEnabled,
    photoFrameTimeout,
    photoFrameSourceIds,
    // Expose internal refs for testing cleanup
    inactivityTimer,
    resetTimerThrottle,
    setupEventListeners,
    removeEventListeners,
  };

  // Store instance for singleton pattern
  photoFrameInstance = instance;

  return instance;
}
