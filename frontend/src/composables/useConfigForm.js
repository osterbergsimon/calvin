/**
 * Composable for managing configuration form state and updates.
 */

import { computed, getCurrentInstance, onUnmounted, ref } from "vue";
import { useConfigStore } from "../stores/config";
import * as configApi from "../services/configApi";
import { logError } from "../utils/logger";
import { friendlyError } from "../utils/friendlyError";
import { normalizeDashboardLayout, normalizeDashboardScreens } from "../utils/layout";
import { normalizeOskExtraLayouts, normalizeOskLayout } from "../utils/oskLayouts";
import { createOptimisticQueue } from "../utils/optimisticQueue";

export function useConfigForm(initialConfig = {}) {
  const configStore = useConfigStore();
  const error = ref("");
  const saveSuccess = ref(false);
  const lastSavedKeys = ref([]);
  let saveSuccessTimer = null;

  // The form is one target: confirmed is the last config the server accepted,
  // and pending holds the keys the user has changed since. The displayed form
  // is pending over confirmed, so a tap shows at once and a failure only
  // reverts the values that actually failed.
  const queue = createOptimisticQueue({
    initial: initialConfig,
    save: async ({ changes }) => {
      error.value = "";
      saveSuccess.value = false;
      // The store POSTs to the backend and applies the result; one request per save.
      await configStore.updateConfig(changes);
      lastSavedKeys.value = Object.keys(changes);
      saveSuccess.value = true;
      if (saveSuccessTimer) {
        clearTimeout(saveSuccessTimer);
      }
      saveSuccessTimer = setTimeout(() => {
        saveSuccess.value = false;
        saveSuccessTimer = null;
      }, 2500);
    },
    onError: err => {
      logError("[useConfigForm]", "Failed to save config:", err);
      error.value = friendlyError(err, "save your settings");
    },
  });

  const saving = queue.saving;
  // A test or a reset may replace the whole form; that also drops anything
  // still queued so it cannot be written after the replacement.
  const localConfig = computed({
    get: () => queue.display.value,
    set: next => {
      queue.discardPending();
      queue.confirm(next);
    },
  });

  const saveStatus = computed(() => {
    if (saving.value) {
      return {
        state: "saving",
        message: "Saving settings...",
      };
    }
    if (error.value) {
      return {
        state: "error",
        message: error.value,
      };
    }
    if (saveSuccess.value) {
      const count = lastSavedKeys.value.length;
      return {
        state: "saved",
        message: count > 0 ? `Saved ${count} setting${count === 1 ? "" : "s"}` : "Settings saved",
      };
    }
    return {
      state: "idle",
      message: "Settings auto-save as you change them",
    };
  });

  // Initialize from config store
  const loadConfig = async () => {
    error.value = "";
    try {
      // Fetch config from API (this updates the store)
      const response = await configApi.getConfig();

      // Map all config values from API response to localConfig
      // Handle both camelCase and snake_case variants
      localConfig.value = {
        ...initialConfig,
        // Orientation
        orientation: response.orientation || "landscape",
        orientationFlipped: response.orientationFlipped ?? response.orientation_flipped ?? false,
        applyDisplayRotation:
          response.applyDisplayRotation ?? response.apply_display_rotation ?? true,
        // Layout
        calendarSplit: response.calendarSplit ?? response.calendar_split ?? 70,
        dashboardLayout: normalizeDashboardLayout(
          response.dashboardLayout ?? response.dashboard_layout ?? null,
          {
            calendarSplit: response.calendarSplit ?? response.calendar_split ?? 70,
            lastSideViewMode: response.lastSideViewMode ?? response.last_side_view_mode ?? "photos",
          }
        ),
        dashboardScreens: normalizeDashboardScreens(
          response.dashboardScreens ?? response.dashboard_screens ?? null
        ),
        // Global page assignment: what browsers and new screens show (the
        // Default screen's Pages section).
        availableScreens: Array.isArray(response.availableScreens)
          ? response.availableScreens
          : Array.isArray(response.available_screens)
            ? response.available_screens
            : null,
        defaultScreenId: response.defaultScreenId ?? response.default_screen_id ?? null,
        lastSideViewMode: response.lastSideViewMode ?? response.last_side_view_mode ?? "photos",
        showWebServices: response.showWebServices ?? response.show_web_services ?? false,
        // Photos
        photoFrameEnabled: response.photoFrameEnabled ?? response.photo_frame_enabled ?? false,
        photoFrameTimeout: response.photoFrameTimeout ?? response.photo_frame_timeout ?? 300,
        photoFrameSourceIds: Array.isArray(
          response.photoFrameSourceIds ?? response.photo_frame_source_ids
        )
          ? (response.photoFrameSourceIds ?? response.photo_frame_source_ids)
          : [],
        photoRotationInterval:
          response.photoRotationInterval ?? response.photo_rotation_interval ?? 30,
        imageDisplayMode: response.imageDisplayMode ?? response.image_display_mode ?? "smart",
        randomizeImages: response.randomizeImages ?? response.randomize_images ?? false,
        // UI
        showUI: response.showUI ?? response.show_ui ?? true,
        modeIndicatorTimeout: response.modeIndicatorTimeout ?? response.mode_indicator_timeout ?? 5,
        focusLightMode: response.focusLightMode ?? response.focus_light_mode ?? "interaction",
        focusLightDimOthers:
          response.focusLightDimOthers ?? response.focus_light_dim_others ?? true,
        effectsLevel: response.effectsLevel ?? response.effects_level ?? "auto",
        loadingLight: response.loadingLight ?? response.loading_light ?? "comet",
        touchControls: response.touchControls ?? response.touch_controls ?? "auto",
        touchControlSize: response.touchControlSize ?? response.touch_control_size ?? "medium",
        tapAnywhereReveal: response.tapAnywhereReveal ?? response.tap_anywhere_reveal ?? false,
        hotCornerPosition:
          response.hotCornerPosition ?? response.hot_corner_position ?? "bottom-left",
        hotCornerOpacity: response.hotCornerOpacity ?? response.hot_corner_opacity ?? 55,
        hotCornerSize: response.hotCornerSize ?? response.hot_corner_size ?? 64,
        hotCornerLongPressMs:
          response.hotCornerLongPressMs ?? response.hot_corner_long_press_ms ?? 500,
        // Calendar
        timeFormat: response.timeFormat ?? response.time_format ?? "24h",
        weekStartDay: response.weekStartDay ?? response.week_start_day ?? 1,
        showWeekNumbers: response.showWeekNumbers ?? response.show_week_numbers ?? false,
        weekendDays: response.weekendDays ?? response.weekend_days ?? [0, 6],
        showRedDays: response.showRedDays ?? response.show_red_days ?? false,
        maxVisibleEvents: response.maxVisibleEvents ?? response.max_visible_events ?? 4,
        // Theme
        themeMode: response.themeMode ?? response.theme_mode ?? "auto",
        selectedTheme: response.selectedTheme ?? response.selected_theme ?? null,
        darkModeStart: response.darkModeStart ?? response.dark_mode_start ?? 18,
        darkModeEnd: response.darkModeEnd ?? response.dark_mode_end ?? 6,
        // Display
        displayScheduleEnabled:
          response.displayScheduleEnabled ?? response.display_schedule_enabled ?? false,
        displaySchedule: response.displaySchedule
          ? typeof response.displaySchedule === "string"
            ? JSON.parse(response.displaySchedule)
            : response.displaySchedule
          : response.display_schedule
            ? typeof response.display_schedule === "string"
              ? JSON.parse(response.display_schedule)
              : response.display_schedule
            : [
                { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" },
                { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" },
              ],
        displayTimeoutEnabled:
          response.displayTimeoutEnabled ?? response.display_timeout_enabled ?? false,
        displayTimeout: response.displayTimeout ?? response.display_timeout ?? 0,
        // Keyboard
        onScreenKeyboard: response.onScreenKeyboard ?? response.on_screen_keyboard ?? "auto",
        // The on-screen keyboard's layout is its own setting, never the UI language.
        oskLayout: normalizeOskLayout(response.oskLayout ?? response.osk_layout ?? null),
        oskExtraLayouts: normalizeOskExtraLayouts(
          response.oskExtraLayouts ?? response.osk_extra_layouts ?? []
        ),
        keyboardFeedbackEnabled:
          response.keyboardFeedbackEnabled ?? response.keyboard_feedback_enabled ?? true,
        keyboardFeedbackMode:
          response.keyboardFeedbackMode ?? response.keyboard_feedback_mode ?? "normal",
        rebootComboKey1: response.rebootComboKey1 ?? response.reboot_combo_key1 ?? "KEY_1",
        rebootComboKey2: response.rebootComboKey2 ?? response.reboot_combo_key2 ?? "KEY_7",
        rebootComboDuration:
          response.rebootComboDuration ?? response.reboot_combo_duration ?? 10000,
        // Clock
        timezone: response.timezone ?? null,
        clockShowDate: response.clockShowDate ?? response.clock_show_date ?? false,
        clockShowSeconds: response.clockShowSeconds ?? response.clock_show_seconds ?? false,
        clockBarMode: response.clockBarMode ?? response.clock_bar_mode ?? "horizontal",
        clockBarShowInKiosk:
          response.clockBarShowInKiosk ?? response.clock_bar_show_in_kiosk ?? false,
        clockBarPosition: response.clockBarPosition ?? response.clock_bar_position ?? "top",
        clockBarFontSize: response.clockBarFontSize ?? response.clock_bar_font_size ?? 16,
        clockBarDateFontSize:
          response.clockBarDateFontSize ?? response.clock_bar_date_font_size ?? 14,
        clockBarLayout:
          response.clockBarLayout === "two-lines" || response.clock_bar_layout === "two-lines"
            ? "two-lines"
            : "single-line",
        clockBarVerticalLayout:
          response.clockBarVerticalLayout ??
          response.clock_bar_vertical_layout ??
          (response.clockBarLayout === "vertical-compact" ||
          response.clock_bar_layout === "vertical-compact"
            ? "compact-time"
            : "upright"),
        clockBarVerticalFontSize:
          response.clockBarVerticalFontSize ?? response.clock_bar_vertical_font_size ?? 18,
        clockBarVerticalDateFontSize:
          response.clockBarVerticalDateFontSize ?? response.clock_bar_vertical_date_font_size ?? 11,
        clockBarVerticalPadding:
          response.clockBarVerticalPadding ?? response.clock_bar_vertical_padding ?? 8,
        clockBarPadding: response.clockBarPadding ?? response.clock_bar_padding ?? 8,
        clockBarShowPluginItems:
          response.clockBarShowPluginItems ?? response.clock_bar_show_plugin_items ?? true,
        clockBarShowLogo: response.clockBarShowLogo ?? response.clock_bar_show_logo ?? true,
        // Other
        uiSize: response.uiSize ?? response.ui_size ?? "default",
        consoleLogEnabled: response.consoleLogEnabled ?? response.console_log_enabled ?? true,
        consoleLogLevel: response.consoleLogLevel ?? response.console_log_level ?? "info",
        configPollInterval: response.configPollInterval ?? response.config_poll_interval ?? 30,
        calendarRefreshInterval:
          response.calendarRefreshInterval ?? response.calendar_refresh_interval ?? 15,
        gitRepoUrl: response.gitRepoUrl ?? response.git_repo_url ?? null,
        gitBranch: response.gitBranch ?? response.git_branch ?? "develop",
        version: response.version ?? null,
        revision: response.revision ?? null,
        frontendVersion: response.frontendVersion ?? response.frontend_version ?? null,
      };
    } catch (err) {
      logError("[useConfigForm]", "Failed to load config:", err);
      error.value = "Failed to load configuration";
    }
  };

  // Update a single config value. The form value changes first; the save is
  // coalesced with any other quick edits and rolls the value back if it fails.
  const updateConfigValue = (key, value) => queue.setPartial({ [key]: value });

  // Update multiple config values
  const updateConfig = updates => queue.setPartial(updates);

  // Save config to backend. This is the shared write path: a control has
  // already applied its value locally by the time it gets here.
  const saveConfig = async (updates = null) => {
    return queue.setPartial(updates || queue.display.value);
  };

  // Reset to store values
  const resetConfig = async () => {
    await loadConfig();
  };

  // Never lose a queued value on navigation or a page close.
  const flush = () => {
    void queue.flush();
  };
  if (typeof window !== "undefined" && getCurrentInstance()) {
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    onUnmounted(() => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    });
  }

  return {
    localConfig,
    saving,
    error,
    saveSuccess,
    saveStatus,
    lastSavedKeys,
    loadConfig,
    updateConfigValue,
    updateConfig,
    saveConfig,
    resetConfig,
  };
}
