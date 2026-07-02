import { defineStore } from "pinia";
import { ref } from "vue";
import { useConfigStore } from "./config";

export const useModeStore = defineStore("mode", () => {
  // Available modes
  const MODES = {
    CALENDAR: "calendar",
    PHOTOS: "photos",
    WEB_SERVICES: "web_services",
    SETTINGS: "settings",
  };

  const currentMode = ref(MODES.CALENDAR);
  const previousMode = ref(null); // For returning from settings
  const isFullscreen = ref(false); // Track if we're in fullscreen mode
  const fullscreenMode = ref(null); // Which mode is fullscreen (CALENDAR, PHOTOS or WEB_SERVICES)
  const fullscreenContext = ref(null); // Optional payload for the fullscreen view (e.g. calendar sourceIds)
  const modeBeforeFullscreen = ref(null); // Track mode before entering fullscreen

  const setMode = mode => {
    if (mode === MODES.SETTINGS) {
      // Store previous mode when entering settings
      previousMode.value = currentMode.value;
    }
    // When switching modes, exit fullscreen and stay on dashboard
    isFullscreen.value = false;
    fullscreenMode.value = null;
    fullscreenContext.value = null;
    currentMode.value = mode;
  };

  const enterFullscreen = (mode, context = null) => {
    // Store current mode before entering fullscreen
    modeBeforeFullscreen.value = currentMode.value;
    isFullscreen.value = true;
    fullscreenMode.value = mode;
    // Optional view context (e.g. the calendar sources of the region that
    // triggered fullscreen). Null for globally-scoped views (photos/services).
    fullscreenContext.value = context;
  };

  const exitFullscreen = () => {
    const wasWebServices = fullscreenMode.value === MODES.WEB_SERVICES;
    const wasPhotos = fullscreenMode.value === MODES.PHOTOS;
    isFullscreen.value = false;
    fullscreenMode.value = null;
    fullscreenContext.value = null;

    // Restore the mode we were in before entering fullscreen
    if (modeBeforeFullscreen.value) {
      currentMode.value = modeBeforeFullscreen.value;
      modeBeforeFullscreen.value = null;
    } else {
      // Fallback: if no previous mode tracked, preserve in side panel based on what was fullscreen
      if (wasWebServices) {
        const configStore = useConfigStore();
        configStore.setLastSideViewMode("web_services");
        currentMode.value = MODES.CALENDAR;
      } else if (wasPhotos) {
        const configStore = useConfigStore();
        configStore.setLastSideViewMode("photos");
        currentMode.value = MODES.CALENDAR;
      } else {
        currentMode.value = MODES.CALENDAR;
      }
    }
  };

  const returnFromSettings = () => {
    if (previousMode.value) {
      currentMode.value = previousMode.value;
      // If returning to web services mode, ensure lastSideViewMode is set
      if (previousMode.value === MODES.WEB_SERVICES) {
        const configStore = useConfigStore();
        configStore.setLastSideViewMode("web_services");
      } else if (previousMode.value === MODES.PHOTOS) {
        const configStore = useConfigStore();
        configStore.setLastSideViewMode("photos");
      }
      previousMode.value = null;
    } else {
      currentMode.value = MODES.CALENDAR;
    }
  };

  const cycleMode = () => {
    const modeOrder = [MODES.CALENDAR, MODES.PHOTOS, MODES.WEB_SERVICES];
    const currentIndex = modeOrder.indexOf(currentMode.value);
    const nextIndex = (currentIndex + 1) % modeOrder.length;
    setMode(modeOrder[nextIndex]);
  };

  return {
    MODES,
    currentMode,
    previousMode,
    isFullscreen,
    fullscreenMode,
    fullscreenContext,
    setMode,
    enterFullscreen,
    exitFullscreen,
    returnFromSettings,
    cycleMode,
  };
});
