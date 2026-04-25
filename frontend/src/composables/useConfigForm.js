/**
 * Composable for managing configuration form state and updates.
 */

import { computed, ref } from "vue";
import { useConfigStore } from "../stores/config";
import { useKeyboardStore } from "../stores/keyboard";
import * as configApi from "../services/configApi";
import { logError } from "../utils/logger";

export function useConfigForm(initialConfig = {}) {
  const configStore = useConfigStore();
  const keyboardStore = useKeyboardStore();
  const localConfig = ref({ ...initialConfig });
  const saving = ref(false);
  const error = ref("");
  const saveSuccess = ref(false);
  const lastSavedKeys = ref([]);
  let saveSuccessTimer = null;

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
        message:
          count > 0
            ? `Saved ${count} setting${count === 1 ? "" : "s"}`
            : "Settings saved",
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
        orientationFlipped:
          response.orientationFlipped ?? response.orientation_flipped ?? false,
        applyDisplayRotation:
          response.applyDisplayRotation ??
          response.apply_display_rotation ??
          true,
        // Layout
        calendarSplit: response.calendarSplit ?? response.calendar_split ?? 70,
        sideViewPosition:
          response.sideViewPosition ?? response.side_view_position ?? "right",
        lastSideViewMode:
          response.lastSideViewMode ?? response.last_side_view_mode ?? "photos",
        showWebServices:
          response.showWebServices ?? response.show_web_services ?? false,
        // Photos
        photoFrameEnabled:
          response.photoFrameEnabled ?? response.photo_frame_enabled ?? false,
        photoFrameTimeout:
          response.photoFrameTimeout ?? response.photo_frame_timeout ?? 300,
        photoRotationInterval:
          response.photoRotationInterval ??
          response.photo_rotation_interval ??
          30,
        imageDisplayMode:
          response.imageDisplayMode ?? response.image_display_mode ?? "smart",
        randomizeImages:
          response.randomizeImages ?? response.randomize_images ?? false,
        // UI
        showUI: response.showUI ?? response.show_ui ?? true,
        modeIndicatorTimeout:
          response.modeIndicatorTimeout ?? response.mode_indicator_timeout ?? 5,
        // Calendar
        calendarViewMode:
          response.calendarViewMode ?? response.calendar_view_mode ?? "month",
        timeFormat: response.timeFormat ?? response.time_format ?? "24h",
        weekStartDay: response.weekStartDay ?? response.week_start_day ?? 1,
        showWeekNumbers:
          response.showWeekNumbers ?? response.show_week_numbers ?? false,
        weekendDays: response.weekendDays ?? response.weekend_days ?? [0, 6],
        showRedDays: response.showRedDays ?? response.show_red_days ?? false,
        maxVisibleEvents:
          response.maxVisibleEvents ?? response.max_visible_events ?? 4,
        // Theme
        themeMode: response.themeMode ?? response.theme_mode ?? "auto",
        selectedTheme:
          response.selectedTheme ?? response.selected_theme ?? null,
        darkModeStart: response.darkModeStart ?? response.dark_mode_start ?? 18,
        darkModeEnd: response.darkModeEnd ?? response.dark_mode_end ?? 6,
        // Display
        displayScheduleEnabled:
          response.displayScheduleEnabled ??
          response.display_schedule_enabled ??
          false,
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
          response.displayTimeoutEnabled ??
          response.display_timeout_enabled ??
          false,
        displayTimeout:
          response.displayTimeout ?? response.display_timeout ?? 0,
        // Keyboard
        keyboardType:
          response.keyboardType ??
          response.keyboard_type ??
          keyboardStore.keyboardType ??
          "7-button",
        keyboardFeedbackEnabled:
          response.keyboardFeedbackEnabled ??
          response.keyboard_feedback_enabled ??
          true,
        keyboardFeedbackMode:
          response.keyboardFeedbackMode ??
          response.keyboard_feedback_mode ??
          "normal",
        rebootComboKey1:
          response.rebootComboKey1 ?? response.reboot_combo_key1 ?? "KEY_1",
        rebootComboKey2:
          response.rebootComboKey2 ?? response.reboot_combo_key2 ?? "KEY_7",
        rebootComboDuration:
          response.rebootComboDuration ??
          response.reboot_combo_duration ??
          10000,
        // Clock
        timezone: response.timezone ?? null,
        clockEnabled: response.clockEnabled ?? response.clock_enabled ?? true,
        clockDisplayMode:
          response.clockDisplayMode ?? response.clock_display_mode ?? "header",
        clockShowDate:
          response.clockShowDate ?? response.clock_show_date ?? false,
        clockShowSeconds:
          response.clockShowSeconds ?? response.clock_show_seconds ?? false,
        clockPosition:
          response.clockPosition ?? response.clock_position ?? "top-right",
        clockSize: response.clockSize ?? response.clock_size ?? "medium",
        // New clock settings
        clockWidgetEnabled:
          response.clockWidgetEnabled ?? response.clock_widget_enabled ?? false,
        clockWidgetShowInKiosk:
          response.clockWidgetShowInKiosk ??
          response.clock_widget_show_in_kiosk ??
          false,
        clockWidgetPosition:
          response.clockWidgetPosition ??
          response.clock_widget_position ??
          "top-right",
        clockBarEnabled:
          response.clockBarEnabled ?? response.clock_bar_enabled ?? false,
        clockBarMode:
          response.clockBarMode ?? response.clock_bar_mode ?? "horizontal",
        clockBarShowInNonKiosk:
          response.clockBarShowInNonKiosk ??
          response.clock_bar_show_in_non_kiosk ??
          false,
        clockBarShowInKiosk:
          response.clockBarShowInKiosk ??
          response.clock_bar_show_in_kiosk ??
          false,
        clockBarPosition:
          response.clockBarPosition ?? response.clock_bar_position ?? "top",
        clockBarFontSize:
          response.clockBarFontSize ?? response.clock_bar_font_size ?? 16,
        clockBarDateFontSize:
          response.clockBarDateFontSize ??
          response.clock_bar_date_font_size ??
          14,
        clockBarLayout:
          response.clockBarLayout ?? response.clock_bar_layout ?? "single-line",
        clockBarPadding:
          response.clockBarPadding ?? response.clock_bar_padding ?? 8,
        // Other
        mealPlanCardSize:
          response.mealPlanCardSize ?? response.meal_plan_card_size ?? "medium",
        consoleLogEnabled:
          response.consoleLogEnabled ?? response.console_log_enabled ?? true,
        consoleLogLevel:
          response.consoleLogLevel ?? response.console_log_level ?? "info",
        configPollInterval:
          response.configPollInterval ?? response.config_poll_interval ?? 30,
        calendarRefreshInterval:
          response.calendarRefreshInterval ??
          response.calendar_refresh_interval ??
          15,
        gitRepoUrl: response.gitRepoUrl ?? response.git_repo_url ?? null,
        gitBranch: response.gitBranch ?? response.git_branch ?? "main",
        version: response.version ?? null,
        frontendVersion:
          response.frontendVersion ?? response.frontend_version ?? null,
      };

      // Update keyboard store
      if (localConfig.value.keyboardType) {
        keyboardStore.setKeyboardType(localConfig.value.keyboardType);
      }
    } catch (err) {
      logError("[useConfigForm]", "Failed to load config:", err);
      error.value = "Failed to load configuration";
    }
  };

  // Update a single config value
  const updateConfigValue = async (key, value) => {
    localConfig.value[key] = value;
    await saveConfig({ [key]: value });
  };

  // Update multiple config values
  const updateConfig = async (updates) => {
    Object.assign(localConfig.value, updates);
    await saveConfig(updates);
  };

  // Save config to backend
  const saveConfig = async (updates = null) => {
    saving.value = true;
    error.value = "";
    saveSuccess.value = false;

    try {
      const configToSave = updates || localConfig.value;
      await configApi.updateConfig(configToSave);
      await configStore.updateConfig(configToSave);
      lastSavedKeys.value = updates ? Object.keys(updates) : [];
      saveSuccess.value = true;
      if (saveSuccessTimer) {
        clearTimeout(saveSuccessTimer);
      }
      saveSuccessTimer = setTimeout(() => {
        saveSuccess.value = false;
        saveSuccessTimer = null;
      }, 2500);
    } catch (err) {
      logError("[useConfigForm]", "Failed to save config:", err);
      error.value =
        err.response?.data?.detail ||
        err.message ||
        "Failed to save configuration";
      throw err;
    } finally {
      saving.value = false;
    }
  };

  // Reset to store values
  const resetConfig = async () => {
    await loadConfig();
  };

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
