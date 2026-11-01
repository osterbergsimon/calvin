import { defineStore } from "pinia";
import { ref, computed, nextTick } from "vue";
import api from "../services/api";
import { getCachedData, setCachedData } from "../utils/cache";
import { logError, logInfo } from "../utils/logger";
import { friendlyError } from "../utils/friendlyError";
import {
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  filterAvailableScreens,
  normalizeDashboardScreens,
  resolveKioskActiveScreen,
  setActiveDashboardScreen,
  setRegionView,
} from "../utils/layout";
import { applyConfigPayload, createDefaultDisplaySchedule } from "./configRegistry";
import { migrateDisplaySettings } from "../utils/displaySettingsMigration";
import { configPath, getKioskId, withViewport } from "@/utils/kioskId";
import {
  decodeScreenValue,
  encodeScreenValue,
  readScreenStorage,
  screenSettingRef,
  screenStorageKey,
} from "../utils/screenSetting";
import { useKiosksStore } from "./kiosks";

// The config is what a kiosk boots from, so its offline copy is kept for a day
// and served (flagged stale) even after that when the backend is unreachable.
const CONFIG_CACHE_TTL = 24 * 60 * 60 * 1000;

// Only one store instance reports a viewport in the app; rebinding replaces the
// previous listener instead of stacking another one.
let viewportResizeHandler = null;

export const useConfigStore = defineStore("config", () => {
  const orientation = ref("landscape"); // 'landscape' | 'portrait'
  const orientationFlipped = ref(false); // Whether orientation is flipped (180° rotation)
  const applyDisplayRotation = ref(true); // Whether to physically rotate display on RPi (default: true)
  const calendarSplit = ref(70); // Percentage for calendar (10-90%, default 70%)
  const dashboardLayout = ref(null); // Dashboard region layout configuration
  const dashboardScreens = ref(null); // Dashboard screen configuration
  const availableScreens = ref(null); // per-kiosk allowlist (kiosk mode only)
  const defaultScreenId = ref(null); // per-kiosk boot screen (kiosk mode only)
  const kioskActiveScreenId = ref(null); // local active screen in kiosk mode
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
  const focusLightMode = ref("interaction");
  const focusLightDimOthers = ref(true);
  const loadingLight = ref("comet"); // Loading light style: 'comet' | 'pulse' | 'off' (CLV-115)
  const layoutMode = ref("auto"); // Forced layout per screen: 'auto' | 'desktop' | 'phone' (calvin-tnkg)
  const regionsLocked = ref(true); // Dashboard region drag-resize is locked by default (touch-wall safety)
  const tapAnywhereReveal = ref(false); // When UI is hidden, whether tapping content re-shows it (default: hot corner only)
  const hotCornerPosition = ref("bottom-left"); // Reveal hot corner: 'bottom-left'|'bottom-right'|'top-left'|'top-right'
  const hotCornerOpacity = ref(55); // Rest opacity of the reveal hot corner, 0–100 (0 = invisible but still armed)
  const hotCornerSize = ref(64); // Reveal hot corner square size / long-press hit-box, px
  const hotCornerLongPressMs = ref(500); // Press-and-hold duration to trigger the reveal, ms
  const touchControls = ref("auto"); // 'auto' (detect) | 'on' (force) | 'off' (hide) touch chrome
  const touchControlSize = ref("medium"); // 'small' | 'medium' | 'large' — region touch control size
  const onScreenKeyboard = ref("auto"); // 'auto' (touch, wider than a phone) | 'on' (always) | 'off' (never)
  // On-screen keyboard letter layout. Independent of the UI language: null
  // means "use the device's one-time navigator.language hint".
  const oskLayout = ref(null); // 'en' | 'sv' | 'fi' | 'no' | 'da' | 'de' | 'fr' | null
  const oskExtraLayouts = ref([]); // Extra layouts the layout key cycles through, in order
  const uiSize = ref("default"); // Global UI size: 'extra-compact' | 'compact' | 'default' | 'large' | 'extra-large'
  const consoleLogEnabled = ref(true); // Enable console logging (default: true for backwards compatibility)
  const consoleLogLevel = ref("info"); // Console log level: 'error' | 'warn' | 'info' | 'debug' (default: 'info')
  const configPollInterval = ref(30); // Config polling interval in seconds (default: 30)
  const devMode = ref(false); // Whether the backend is running in dev mode (backend/.dev marker file)
  const pluginRepositoryUrl = ref("https://github.com/osterbergsimon/calvin-plugins"); // Default plugin repo for the GitHub install flow
  // The official add-on catalog the Content provider picker may install from
  // (CLV-45). Separate from pluginRepositoryUrl above: that one is the user's
  // "another GitHub repository" field and must never reach a one-click install.
  const pluginCatalogRepo = ref("https://github.com/osterbergsimon/calvin-plugins");
  const loading = ref(false);
  const error = ref(null);
  // One friendly sentence for the screen; `error` keeps the raw text for logs.
  const errorText = ref("");
  // True while the applied config came from the offline cache.
  const stale = ref(false);
  // Set after the first successful load: from then on the in-memory config is
  // newer than the cached copy, so a failed poll keeps it instead.
  let loadedFromServer = false;
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
    focusLightMode,
    focusLightDimOthers,
    loadingLight,
    layoutMode,
    regionsLocked,
    tapAnywhereReveal,
    hotCornerPosition,
    hotCornerOpacity,
    hotCornerSize,
    hotCornerLongPressMs,
    touchControls,
    touchControlSize,
    onScreenKeyboard,
    oskLayout,
    oskExtraLayouts,
    uiSize,
    consoleLogEnabled,
    consoleLogLevel,
    configPollInterval,
    devMode,
    pluginRepositoryUrl,
    pluginCatalogRepo,
  };

  // --- Per-screen control visibility (calvin-hi6w) --------------------------
  // Hiding the controls, keeping the clock bar while hidden and tap-to-reveal
  // used to be one household setting. They belong to the screen now: a kiosk
  // stores its choice in its overrides (which arrive already merged into the
  // refs above), any other browser keeps it in localStorage and falls back to
  // the global value while it has no choice of its own. These three refs are
  // shared with useScreenSetting, so the Settings rows and the dashboard ⋯
  // menu always write the same value.
  const kioskScope = Boolean(getKioskId());
  const showUIScreenStorage = screenStorageKey("showUI");
  const clockBarInKioskScreenStorage = screenStorageKey("clockBarShowInKiosk");
  const tapAnywhereScreenStorage = screenStorageKey("tapAnywhereReveal");
  const showUIScreenRaw = screenSettingRef(showUIScreenStorage);
  const clockBarInKioskScreenRaw = screenSettingRef(clockBarInKioskScreenStorage);
  const tapAnywhereScreenRaw = screenSettingRef(tapAnywhereScreenStorage);
  if (!kioskScope) {
    // A shared ref may survive a remount (tests, HMR); the page's storage wins.
    showUIScreenRaw.value = readScreenStorage(showUIScreenStorage);
    clockBarInKioskScreenRaw.value = readScreenStorage(clockBarInKioskScreenStorage);
    tapAnywhereScreenRaw.value = readScreenStorage(tapAnywhereScreenStorage);
  }

  const decodeScreenChoice = (raw, fallback) => decodeScreenValue(raw, fallback);
  const effectiveShowUI = computed(() => {
    if (kioskScope) return showUI.value;
    return decodeScreenChoice(showUIScreenRaw.value, true) ?? showUI.value;
  });
  const effectiveClockBarShowInKiosk = computed(() => {
    if (kioskScope) return clockBarShowInKiosk.value;
    return decodeScreenChoice(clockBarInKioskScreenRaw.value, false) ?? clockBarShowInKiosk.value;
  });
  const effectiveTapAnywhereReveal = computed(() => {
    if (kioskScope) return tapAnywhereReveal.value;
    return decodeScreenChoice(tapAnywhereScreenRaw.value, false) ?? tapAnywhereReveal.value;
  });

  const writeScreenControl = async (key, storageKey, raw, next) => {
    if (kioskScope) {
      const kiosksStore = useKiosksStore();
      const overrides = (await kiosksStore.fetchOverrides(getKioskId())) || {};
      await kiosksStore.saveOverrides(getKioskId(), { ...overrides, [key]: next });
      configRefs[key].value = next;
      return;
    }
    raw.value = encodeScreenValue(next);
    try {
      window.localStorage.setItem(storageKey, raw.value);
    } catch {
      // Storage blocked: the choice lasts for this page load.
    }
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

  // Kiosks report their viewport on load and, debounced, on resize so the
  // editor's preview follows the real screen shape (CLV-36).
  let viewportTimer = null;
  let viewportBound = false;
  const bindViewportReporting = () => {
    if (viewportBound || !getKioskId()) return;
    viewportBound = true;
    if (viewportResizeHandler) window.removeEventListener("resize", viewportResizeHandler);
    viewportResizeHandler = () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => fetchConfig(), 2000);
    };
    window.addEventListener("resize", viewportResizeHandler);
  };

  // One-time move of the old household display settings into regions (CLV-49).
  // The flag lives in config; the old keys stay stored but are never read again.
  const migrateDisplaySettingsOnce = async data => {
    if (!data || typeof data !== "object" || data.displaySettingsMigrated === true) return;
    const rawScreens = data.dashboardScreens ?? data.dashboard_screens;
    if (!rawScreens) return;
    const result = migrateDisplaySettings(rawScreens, {
      showWeekNumbers: data.showWeekNumbers ?? data.show_week_numbers ?? false,
      maxVisibleEvents: data.maxVisibleEvents ?? data.max_visible_events ?? 4,
      imageDisplayMode: data.imageDisplayMode ?? data.image_display_mode ?? "smart",
    });
    if (result.changed) {
      dashboardScreens.value = result.screens;
      data.dashboardScreens = result.screens;
    }
    try {
      await updateConfig({
        displaySettingsMigrated: true,
        ...(result.changed ? { dashboardScreens: result.screens } : {}),
      });
      data.displaySettingsMigrated = true;
    } catch (err) {
      // Offline or not allowed to save: keep the in-memory values and retry on
      // the next successful fetch rather than losing the user's old settings.
      logError("[ConfigStore]", "Display settings migration could not be saved:", err);
    }
  };

  const clearError = () => {
    error.value = null;
    errorText.value = "";
  };

  const captureError = (err, action, message) => {
    error.value = err.message;
    errorText.value = friendlyError(err, action);
    logError("[ConfigStore]", message, err);
  };

  const fetchConfig = async () => {
    loading.value = true;
    clearError();
    bindViewportReporting();
    const path = withViewport(configPath());
    const cacheKey = `config_${path}`;
    const applyFetched = data => {
      applyConfigPayload(data, configRefs, { useDefaults: true });
      if (getKioskId()) {
        availableScreens.value = data?.availableScreens ?? null;
        defaultScreenId.value = data?.defaultScreenId ?? null;
        seedKioskActiveScreen();
      }
    };
    try {
      const response = await api.get(path);
      applyFetched(response.data);
      await migrateDisplaySettingsOnce(response.data);
      setCachedData(cacheKey, response.data);
      loadedFromServer = true;
      stale.value = false;
      return response.data;
    } catch (err) {
      if (!loadedFromServer) {
        const cached = getCachedData(cacheKey, CONFIG_CACHE_TTL, { allowStale: true });
        if (cached) {
          logInfo("[ConfigStore]", "Backend unreachable, using cached config");
          applyFetched(cached);
          await migrateDisplaySettingsOnce(cached);
          stale.value = true;
          return cached;
        }
      }
      captureError(err, "load your settings", "Failed to fetch config:");
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
    clearError();
    try {
      const response = await api.post("/config", config);
      applyConfigPayload(config, configRefs);
      applyConfigPayload(response.data || {}, configRefs);
      return response.data;
    } catch (err) {
      captureError(err, "save your settings", "Failed to update config:");
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
    clearTemporaryUI();

    // This screen's own choice: a kiosk override, or this browser's storage.
    // The global value stays the default for screens that have no choice.
    try {
      await writeScreenControl("showUI", showUIScreenStorage, showUIScreenRaw, newValue);
    } catch (err) {
      logError("[ConfigStore]", "Failed to save UI visibility:", err);
    }
  };

  const clearTemporaryUI = () => {
    if (temporaryUITimer.value) {
      clearTimeout(temporaryUITimer.value);
      temporaryUITimer.value = null;
    }
    teardownUiActivityListeners();
    showUITemporary.value = false;
  };

  // Show UI temporarily (for accessing settings, etc.)
  // This doesn't change the persistent showUI setting.
  //
  // The reveal is an inactivity window, not a hard cut-off: while the chrome is
  // up, any user activity re-arms the hide timer (see the activity listeners
  // below), so the UI never disappears out from under someone who is actively
  // using it. It only hides after `durationSeconds` of genuine idle.
  const UI_ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
  let temporaryUIDurationMs = 60000;
  let lastUiActivityRearm = 0;
  let uiActivityListening = false;

  const armTemporaryUITimer = () => {
    if (temporaryUITimer.value) {
      clearTimeout(temporaryUITimer.value);
      temporaryUITimer.value = null;
    }
    temporaryUITimer.value = setTimeout(() => {
      showUITemporary.value = false;
      temporaryUITimer.value = null;
      teardownUiActivityListeners();
    }, temporaryUIDurationMs);
  };

  const onUiActivity = () => {
    // Only meaningful while the temporary reveal is up; ignore otherwise.
    if (!showUITemporary.value) return;
    // Throttle re-arms — high-frequency events (pointermove) shouldn't churn the
    // timer hundreds of times a second; a re-arm every 300ms keeps it alive.
    const now = Date.now();
    if (now - lastUiActivityRearm < 300) return;
    lastUiActivityRearm = now;
    armTemporaryUITimer();
  };

  const setupUiActivityListeners = () => {
    if (uiActivityListening || typeof window === "undefined") return;
    UI_ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, onUiActivity, { passive: true })
    );
    uiActivityListening = true;
  };

  const teardownUiActivityListeners = () => {
    if (!uiActivityListening || typeof window === "undefined") return;
    UI_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, onUiActivity));
    uiActivityListening = false;
  };

  const showUITemporarily = (durationSeconds = 60) => {
    temporaryUIDurationMs = durationSeconds * 1000;
    showUITemporary.value = true;
    setupUiActivityListeners();
    armTemporaryUITimer();
  };

  // Computed property to determine if UI should be shown
  // Shows UI if either persistent setting is on OR temporary override is active
  const shouldShowUI = computed(() => {
    return effectiveShowUI.value || showUITemporary.value;
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
    if (getKioskId()) {
      // Kiosk mode: local only — never persist to global. Honor availableScreens.
      const ids = new Set(effectiveDashboardScreens.value.screens.map(s => s.id));
      if (ids.has(screenId)) kioskActiveScreenId.value = screenId;
      return;
    }
    const nextScreens = setActiveDashboardScreen(dashboardScreens.value, screenId);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const cycleDashboardScreenBy = async direction => {
    if (getKioskId()) {
      const screens = effectiveDashboardScreens.value.screens;
      if (screens.length <= 1) return;
      const cur = screens.findIndex(s => s.id === kioskActiveScreenId.value);
      const next = (cur + direction + screens.length) % screens.length;
      kioskActiveScreenId.value = screens[next].id;
      return;
    }
    const nextScreens = cycleDashboardScreen(dashboardScreens.value, direction);
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const cycleActiveDashboardRegionBy = async direction => {
    // Target the screen the operator is actually viewing. In kiosk mode that is the
    // local kioskActiveScreenId (via effectiveDashboardScreens); in Mode A it equals the
    // global activeScreenId. Region state itself stays global (persisted) by dd9.4 design.
    const nextScreens = cycleActiveDashboardRegion(
      dashboardScreens.value,
      direction,
      effectiveDashboardScreens.value.activeScreenId
    );
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  // Merge `patch` into a calendar region's `view` (base mode / rolling / counts)
  // on the active screen, and persist. Drives the on-calendar view controls.
  const updateRegionView = async (regionId, patch) => {
    const nextScreens = setRegionView(
      dashboardScreens.value,
      regionId,
      patch,
      effectiveDashboardScreens.value.activeScreenId
    );
    dashboardScreens.value = nextScreens;
    await updateConfig({ dashboardScreens: nextScreens });
  };

  const effectiveDashboardScreens = computed(() => {
    const normalized = normalizeDashboardScreens(dashboardScreens.value);
    if (!getKioskId()) return normalized; // Mode A: unchanged
    const filtered = filterAvailableScreens(normalized, availableScreens.value);
    return { ...filtered, activeScreenId: kioskActiveScreenId.value ?? filtered.activeScreenId };
  });

  const seedKioskActiveScreen = () => {
    if (!getKioskId()) return;
    kioskActiveScreenId.value = resolveKioskActiveScreen({
      screensConfig: dashboardScreens.value,
      availableScreens: availableScreens.value,
      defaultScreenId: defaultScreenId.value,
      current: kioskActiveScreenId.value,
    });
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
    availableScreens,
    defaultScreenId,
    kioskActiveScreenId,
    effectiveDashboardScreens,
    seedKioskActiveScreen,
    showWebServices,
    lastSideViewMode,
    photoFrameEnabled,
    photoFrameTimeout,
    showUI,
    effectiveShowUI,
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
    effectiveClockBarShowInKiosk,
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
    pluginCatalogRepo,
    focusLightMode,
    focusLightDimOthers,
    loadingLight,
    layoutMode,
    regionsLocked,
    tapAnywhereReveal,
    effectiveTapAnywhereReveal,
    hotCornerPosition,
    hotCornerOpacity,
    hotCornerSize,
    hotCornerLongPressMs,
    toggleRegionsLock,
    touchControls,
    touchControlSize,
    onScreenKeyboard,
    oskLayout,
    oskExtraLayouts,
    loading,
    error,
    errorText,
    stale,
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
    clearTemporaryUI,
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
    setFocusLightMode,
    setFocusLightDimOthers,
    setTouchControls,
    setTouchControlSize,
    fetchConfig,
    updateConfig,
  };
});
