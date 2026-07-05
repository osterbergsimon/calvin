import { defineStore } from "pinia";
import { ref, computed, nextTick } from "vue";
import axios from "axios";
import { logError } from "../utils/logger";
import {
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  normalizeDashboardScreens,
  setActiveDashboardScreen,
  setRegionView,
} from "../utils/layout";
import { applyConfigPayload, createDefaultDisplaySchedule } from "./configRegistry";

export const useConfigStore = defineStore("config", () => {
  const orientation = ref("landscape"); // 'landscape' | 'portrait'
  const orientationFlipped = ref(false); // Whether orientation is flipped (180° rotation)
  const applyDisplayRotation = ref(true); // Whether to physically rotate display on RPi (default: true)
  const calendarSplit = ref(70); // Percentage for calendar (10-90%, default 70%)
  const dashboardLayout = ref(null); // Dashboard region layout configuration
  const dashboardScreens = ref(null); // Dashboard screen configuration
  const lastSideViewMode = ref("photos"); // Track last side view mode ('photos' | 'web_services')
  const showWebServices = ref(false); // Toggle for web services view
  const photoFrameEnabled = ref(false); // Photo frame mode enabled
  const photoFrameTimeout = ref(300); // Photo frame timeout in seconds (5 minutes default)
  const showUI = ref(true); // Show headers and UI controls (can be hidden for kiosk mode)
  const showUITemporary = ref(false); // Temporary UI override (doesn't persist)
  const temporaryUITimer = ref(null); // Timer for temporary UI override
  const modeIndicatorTimeout = ref(5); // Mode change notification auto-hide timeout in seconds (0 = never hide, default 5)
  const photoRotationInterval = ref(30); // Photo rotation interval in seconds (default 30)
  const calendarRefreshInterval = ref(15); // Calendar refresh interval in minutes (default 15)
  const timeFormat = ref("24h"); // Time format: '12h' or '24h' (default: '24h')
  const weekStartDay = ref(1); // Week starting day (0=Sunday, 1=Monday, ..., 6=Saturday, default Monday)
  const showWeekNumbers = ref(false); // Show week numbers in calendar (default false)
  const weekendDays = ref([0, 6]); // Weekend days (0=Sunday, 6=Saturday, default [0, 6])
  const showRedDays = ref(false); // Show red days (holidays) if enabled (default false)
  const maxVisibleEvents = ref(4); // Maximum visible events per day before showing overflow (default 4)
  const themeMode = ref("auto"); // Theme mode: 'light' | 'dark' | 'auto' | 'time'
  const selectedTheme = ref(null); // Selected custom theme ID (null = use themeMode)
  const darkModeStart = ref(18); // Dark mode start hour (0-23, default 18 = 6 PM)
  const darkModeEnd = ref(6); // Dark mode end hour (0-23, default 6 = 6 AM)
  const displayScheduleEnabled = ref(false); // Enable display power schedule
  const displaySchedule = ref(createDefaultDisplaySchedule()); // Display schedule per day of week
  const displayTimeoutEnabled = ref(false); // Enable display timeout (screensaver)
  const displayTimeout = ref(0); // Display timeout in seconds (0 = never)
  const rebootComboKey1 = ref("KEY_1"); // First key for reboot combo
  const rebootComboKey2 = ref("KEY_7"); // Second key for reboot combo
  const rebootComboDuration = ref(10000); // Reboot combo duration in milliseconds
  const keyboardFeedbackEnabled = ref(true); // Enable visual keyboard feedback (default: true)
  const keyboardFeedbackMode = ref("normal"); // Keyboard feedback mode: 'normal' | 'small' (default: 'normal')
  const imageDisplayMode = ref("smart"); // Image display mode: 'fit', 'fill', 'crop', 'center', 'smart' (default: 'smart')
  const timezone = ref(null); // Timezone (e.g., "America/New_York", "Europe/London", "UTC") - null = system timezone
  const clockShowDate = ref(false);
  const clockShowSeconds = ref(false);
  const clockBarMode = ref("horizontal"); // 'horizontal' | 'vertical'
  const clockBarShowInKiosk = ref(false);
  const clockBarPosition = ref("top"); // horizontal: 'top' | 'bottom' | 'between', vertical: 'left' | 'right' | 'between'
  const clockBarFontSize = ref(16);
  const clockBarDateFontSize = ref(14);
  const clockBarLayout = ref("single-line"); // 'single-line' | 'two-lines'
  const clockBarVerticalLayout = ref("upright"); // 'upright' | 'compact-time' | 'compact-time-date'
  const clockBarVerticalFontSize = ref(18);
  const clockBarVerticalDateFontSize = ref(11);
  const clockBarVerticalPadding = ref(8);
  const clockBarPadding = ref(8);
  const clockBarPluginItemSize = ref(16);
  const clockBarVerticalPluginItemSize = ref(16);
  const clockBarShowPluginItems = ref(true);
  const clockBarShowLogo = ref(true);
  const displayName = ref("");
  const focusLightMode = ref("interaction");
  const focusLightDimOthers = ref(true);
  const regionsLocked = ref(true); // Dashboard region drag-resize is locked by default (touch-wall safety)
  const tapAnywhereReveal = ref(false); // When UI is hidden, whether tapping content re-shows it (default: hot corner only)
  const hotCornerPosition = ref("bottom-left"); // Reveal hot corner: 'bottom-left'|'bottom-right'|'top-left'|'top-right'
  const hotCornerOpacity = ref(55); // Rest opacity of the reveal hot corner, 0–100 (0 = invisible but still armed)
  const hotCornerSize = ref(64); // Reveal hot corner square size / long-press hit-box, px
  const hotCornerLongPressMs = ref(500); // Press-and-hold duration to trigger the reveal, ms
  const touchControls = ref("auto"); // 'auto' (detect) | 'on' (force) | 'off' (hide) touch chrome
  const touchControlSize = ref("medium"); // 'small' | 'medium' | 'large' — region touch control size
  const uiSize = ref("default"); // Global UI size: 'extra-compact' | 'compact' | 'default' | 'large' | 'extra-large'
  const consoleLogEnabled = ref(true); // Enable console logging (default: true for backwards compatibility)
  const consoleLogLevel = ref("info"); // Console log level: 'error' | 'warn' | 'info' | 'debug' (default: 'info')
  const configPollInterval = ref(30); // Config polling interval in seconds (default: 30)
  const devMode = ref(false); // Whether the backend is running in dev mode (backend/.dev marker file)
  const pluginRepositoryUrl = ref("https://github.com/osterbergsimon/calvin-plugins"); // Default plugin repo for the GitHub install flow
  const loading = ref(false);
  const error = ref(null);
  // Latches true once the initial config load has settled. Consumers use this
  // to ignore the boot-time hydration, where refs flip from their defaults to
  // the persisted values (e.g. showUI true->false) and would otherwise look
  // like user-driven changes. See NotificationSystem's mode HUD (calvin-2ck).
  const hydrated = ref(false);

  const configRefs = {
    orientation,
    orientationFlipped,
    applyDisplayRotation,
    calendarSplit,
    dashboardLayout,
    dashboardScreens,
    lastSideViewMode,
    photoFrameEnabled,
    photoFrameTimeout,
    showUI,
    modeIndicatorTimeout,
    photoRotationInterval,

    calendarRefreshInterval,
    timeFormat,
    weekStartDay,
    showWeekNumbers,
    weekendDays,
    showRedDays,
    maxVisibleEvents,
    themeMode,
    selectedTheme,
    darkModeStart,
    darkModeEnd,
    displayScheduleEnabled,
    displaySchedule,
    displayTimeoutEnabled,
    displayTimeout,
    rebootComboKey1,
    rebootComboKey2,
    rebootComboDuration,
    keyboardFeedbackEnabled,
    keyboardFeedbackMode,
    imageDisplayMode,
    timezone,
    clockShowDate,
    clockShowSeconds,
    clockBarMode,
    clockBarShowInKiosk,
    clockBarPosition,
    clockBarFontSize,
    clockBarDateFontSize,
    clockBarLayout,
    clockBarVerticalLayout,
    clockBarVerticalFontSize,
    clockBarVerticalDateFontSize,
    clockBarVerticalPadding,
    clockBarPadding,
    clockBarPluginItemSize,
    clockBarVerticalPluginItemSize,
    clockBarShowPluginItems,
    clockBarShowLogo,
    displayName,
    focusLightMode,
    focusLightDimOthers,
    regionsLocked,
    tapAnywhereReveal,
    hotCornerPosition,
    hotCornerOpacity,
    hotCornerSize,
    hotCornerLongPressMs,
    touchControls,
    touchControlSize,
    uiSize,
    consoleLogEnabled,
    consoleLogLevel,
    configPollInterval,
    devMode,
    pluginRepositoryUrl,
  };

  const setOrientation = newOrientation => {
    orientation.value = newOrientation;
  };

  const setOrientationFlipped = flipped => {
    orientationFlipped.value = flipped;
  };

  const setApplyDisplayRotation = apply => {
    applyDisplayRotation.value = apply;
  };

  const setLastSideViewMode = mode => {
    lastSideViewMode.value = mode;
  };

  const setCalendarSplit = percentage => {
    // Clamp between 10 and 90 to prevent UI issues while allowing flexibility
    calendarSplit.value = Math.max(10, Math.min(90, percentage));
  };

  const toggleWebServices = () => {
    showWebServices.value = !showWebServices.value;
  };

  const calendarWidth = computed(() => `${calendarSplit.value}%`);
  const photosWidth = computed(() => `${100 - calendarSplit.value}%`);

  const fetchConfig = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/config");
      applyConfigPayload(response.data, configRefs, { useDefaults: true });
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[ConfigStore]", "Failed to fetch config:", err);
    } finally {
      loading.value = false;
      // Mark hydrated only after this flush, so any watcher fired by the config
      // just applied above (e.g. the showUI true->false settle) still observes
      // hydrated === false and can skip the boot-time transition.
      if (!hydrated.value) {
        nextTick(() => {
          hydrated.value = true;
        });
      }
    }
  };

  const updateConfig = async config => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.post("/api/config", config);
      applyConfigPayload(config, configRefs);
      applyConfigPayload(response.data || {}, configRefs);
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[ConfigStore]", "Failed to update config:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const setPhotoFrameEnabled = enabled => {
    photoFrameEnabled.value = enabled;
  };

  const setPhotoFrameTimeout = timeout => {
    photoFrameTimeout.value = timeout;
  };

  const setShowUI = show => {
    showUI.value = show;
  };

  // Lock/unlock direct drag-resize of dashboard regions. Locked by default so a
  // touch wall never reshapes its layout by accident.
  const toggleRegionsLock = async () => {
    await updateConfig({ regionsLocked: !regionsLocked.value });
  };

  const toggleUI = async () => {
    // Toggle based on the actual visible state (shouldShowUI), not just showUI
    const currentlyVisible = shouldShowUI.value;
    const newValue = !currentlyVisible;

    // Clear any temporary UI override when toggling permanently
    if (temporaryUITimer.value) {
      clearTimeout(temporaryUITimer.value);
      temporaryUITimer.value = null;
    }
    showUITemporary.value = false;

    // Update the persistent showUI value
    showUI.value = newValue;

    // Persist the change to backend
    try {
      await updateConfig({ showUI: newValue });
    } catch (err) {
      logError("[ConfigStore]", "Failed to save UI visibility:", err);
      // Revert on error
      showUI.value = !newValue;
    }
  };

  // Show UI temporarily (for accessing settings, etc.)
  // This doesn't change the persistent showUI setting
  const showUITemporarily = (durationSeconds = 60) => {
    // Clear any existing timer
    if (temporaryUITimer.value) {
      clearTimeout(temporaryUITimer.value);
      temporaryUITimer.value = null;
    }

    // Show UI temporarily
    showUITemporary.value = true;

    // Hide after duration
    temporaryUITimer.value = setTimeout(() => {
      showUITemporary.value = false;
      temporaryUITimer.value = null;
    }, durationSeconds * 1000);
  };

  // Computed property to determine if UI should be shown
  // Shows UI if either persistent setting is on OR temporary override is active
  const shouldShowUI = computed(() => {
    return showUI.value || showUITemporary.value;
  });

  const setPhotoRotationInterval = interval => {
    photoRotationInterval.value = interval;
  };

  const setTimeFormat = format => {
    timeFormat.value = format;
  };

  const setModeIndicatorTimeout = timeout => {
    modeIndicatorTimeout.value = timeout;
  };

  const setWeekStartDay = day => {
    weekStartDay.value = Math.max(0, Math.min(6, day));
  };

  const setShowWeekNumbers = show => {
    showWeekNumbers.value = show;
  };

  const setWeekendDays = days => {
    // Ensure days is an array of valid day numbers (0-6)
    if (Array.isArray(days)) {
      weekendDays.value = days.filter(d => d >= 0 && d <= 6);
    }
  };

  const setShowRedDays = show => {
    showRedDays.value = show;
  };

  const setMaxVisibleEvents = count => {
    // Clamp between 1 and 20 to prevent UI issues
    maxVisibleEvents.value = Math.max(1, Math.min(20, count));
  };

  const setDashboardScreens = screens => {
    dashboardScreens.value = normalizeDashboardScreens(screens);
  };

  const activateDashboardScreen = async screenId => {
    const nextScreens = setActiveDashboardScreen(dashboardScreens.value, screenId);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const cycleDashboardScreenBy = async direction => {
    const nextScreens = cycleDashboardScreen(dashboardScreens.value, direction);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const cycleActiveDashboardRegionBy = async direction => {
    const nextScreens = cycleActiveDashboardRegion(dashboardScreens.value, direction);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  // Merge `patch` into a calendar region's `view` (base mode / rolling / counts)
  // on the active screen, and persist. Drives the on-calendar view controls.
  const updateRegionView = async (regionId, patch) => {
    const nextScreens = setRegionView(dashboardScreens.value, regionId, patch);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const setThemeMode = mode => {
    themeMode.value = mode;
  };

  const setDarkModeTime = (start, end) => {
    darkModeStart.value = start;
    darkModeEnd.value = end;
  };

  const setImageDisplayMode = mode => {
    imageDisplayMode.value = mode;
  };

  const setDisplayName = name => {
    displayName.value = name;
  };
  const setFocusLightMode = mode => {
    focusLightMode.value = mode;
  };
  const setFocusLightDimOthers = dim => {
    focusLightDimOthers.value = dim;
  };
  const setTouchControls = mode => {
    touchControls.value = mode;
  };
  const setTouchControlSize = size => {
    touchControlSize.value = size;
  };

  return {
    orientation,
    orientationFlipped,
    applyDisplayRotation,
    calendarSplit,
    dashboardLayout,
    dashboardScreens,
    showWebServices,
    lastSideViewMode,
    photoFrameEnabled,
    photoFrameTimeout,
    showUI,
    modeIndicatorTimeout,
    keyboardFeedbackEnabled,
    keyboardFeedbackMode,
    photoRotationInterval,

    calendarRefreshInterval,
    timeFormat,
    weekStartDay,
    showWeekNumbers,
    weekendDays,
    showRedDays,
    maxVisibleEvents,
    themeMode,
    selectedTheme,
    darkModeStart,
    darkModeEnd,
    displayScheduleEnabled,
    displaySchedule,
    displayTimeoutEnabled,
    displayTimeout,
    rebootComboKey1,
    rebootComboKey2,
    rebootComboDuration,
    imageDisplayMode,
    timezone,
    clockShowDate,
    clockShowSeconds,
    clockBarMode,
    clockBarShowInKiosk,
    clockBarPosition,
    clockBarFontSize,
    clockBarDateFontSize,
    clockBarLayout,
    clockBarVerticalLayout,
    clockBarVerticalFontSize,
    clockBarVerticalDateFontSize,
    clockBarVerticalPadding,
    clockBarPadding,
    clockBarPluginItemSize,
    clockBarVerticalPluginItemSize,
    clockBarShowPluginItems,
    clockBarShowLogo,
    uiSize,
    consoleLogEnabled,
    consoleLogLevel,
    configPollInterval,
    devMode,
    pluginRepositoryUrl,
    displayName,
    focusLightMode,
    focusLightDimOthers,
    regionsLocked,
    tapAnywhereReveal,
    hotCornerPosition,
    hotCornerOpacity,
    hotCornerSize,
    hotCornerLongPressMs,
    toggleRegionsLock,
    touchControls,
    touchControlSize,
    loading,
    error,
    hydrated,
    calendarWidth,
    photosWidth,
    setOrientation,
    setOrientationFlipped,
    setApplyDisplayRotation,
    setLastSideViewMode,
    setCalendarSplit,
    toggleWebServices,
    setPhotoFrameEnabled,
    setPhotoFrameTimeout,
    setShowUI,
    toggleUI,
    showUITemporarily,
    shouldShowUI,
    setModeIndicatorTimeout,
    setPhotoRotationInterval,

    setTimeFormat,
    setWeekStartDay,
    setShowWeekNumbers,
    setWeekendDays,
    setShowRedDays,
    setMaxVisibleEvents,
    setDashboardScreens,
    activateDashboardScreen,
    cycleDashboardScreenBy,
    cycleActiveDashboardRegionBy,
    updateRegionView,
    setThemeMode,
    setDarkModeTime,
    setImageDisplayMode,
    setDisplayName,
    setFocusLightMode,
    setFocusLightDimOthers,
    setTouchControls,
    setTouchControlSize,
    fetchConfig,
    updateConfig,
  };
});
