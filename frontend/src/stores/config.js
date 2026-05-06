import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";
import { logError } from "../utils/logger";
import {
  cycleActiveDashboardRegion,
  cycleDashboardScreen,
  normalizeDashboardLayout,
  normalizeDashboardScreens,
  setActiveDashboardScreen,
} from "../utils/layout";

export const useConfigStore = defineStore("config", () => {
  const orientation = ref("landscape"); // 'landscape' | 'portrait'
  const orientationFlipped = ref(false); // Whether orientation is flipped (180° rotation)
  const applyDisplayRotation = ref(true); // Whether to physically rotate display on RPi (default: true)
  const calendarSplit = ref(70); // Percentage for calendar (10-90%, default 70%)
  const dashboardLayout = ref(null); // Dashboard region layout configuration
  const dashboardScreens = ref(null); // Dashboard screen configuration
  const sideViewPosition = ref("right"); // 'left' | 'right' for landscape, 'top' | 'bottom' for portrait
  const lastSideViewMode = ref("photos"); // Track last side view mode ('photos' | 'web_services')
  const showWebServices = ref(false); // Toggle for web services view
  const photoFrameEnabled = ref(false); // Photo frame mode enabled
  const photoFrameTimeout = ref(300); // Photo frame timeout in seconds (5 minutes default)
  const showUI = ref(true); // Show headers and UI controls (can be hidden for kiosk mode)
  const showUITemporary = ref(false); // Temporary UI override (doesn't persist)
  const temporaryUITimer = ref(null); // Timer for temporary UI override
  const modeIndicatorTimeout = ref(5); // Mode change notification auto-hide timeout in seconds (0 = never hide, default 5)
  const photoRotationInterval = ref(30); // Photo rotation interval in seconds (default 30)
  const calendarViewMode = ref("month"); // Calendar view mode: 'month' | 'week' | 'day' | 'rolling'
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
  const displaySchedule = ref([
    { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }, // Monday
    { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" }, // Tuesday
    { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" }, // Wednesday
    { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" }, // Thursday
    { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" }, // Friday
    { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" }, // Saturday
    { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" }, // Sunday
  ]); // Display schedule per day of week
  const displayTimeoutEnabled = ref(false); // Enable display timeout (screensaver)
  const displayTimeout = ref(0); // Display timeout in seconds (0 = never)
  const rebootComboKey1 = ref("KEY_1"); // First key for reboot combo
  const rebootComboKey2 = ref("KEY_7"); // Second key for reboot combo
  const rebootComboDuration = ref(10000); // Reboot combo duration in milliseconds
  const keyboardFeedbackEnabled = ref(true); // Enable visual keyboard feedback (default: true)
  const keyboardFeedbackMode = ref("normal"); // Keyboard feedback mode: 'normal' | 'small' (default: 'normal')
  const imageDisplayMode = ref("smart"); // Image display mode: 'fit', 'fill', 'crop', 'center', 'smart' (default: 'smart')
  const timezone = ref(null); // Timezone (e.g., "America/New_York", "Europe/London", "UTC") - null = system timezone
  // Legacy clock settings (kept for backwards compatibility)
  const clockEnabled = ref(true); // Clock enabled/disabled
  const clockDisplayMode = ref("header"); // Clock display mode: 'always' | 'header' | 'off'
  const clockShowDate = ref(false); // Show date in clock
  const clockShowSeconds = ref(false); // Show seconds in clock
  const clockPosition = ref("top-right"); // Clock position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  const clockSize = ref("medium"); // Clock size: 'small' | 'medium' | 'large'

  // New clock settings
  const clockWidgetEnabled = ref(false); // Widget clock enabled/disabled
  const clockWidgetShowInKiosk = ref(false); // Show widget in kiosk mode
  const clockWidgetPosition = ref("top-right"); // Widget position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  const clockBarEnabled = ref(false); // Bar clock enabled/disabled
  const clockBarMode = ref("horizontal"); // Bar mode: 'horizontal' | 'vertical'
  const clockBarShowInNonKiosk = ref(false); // Show bar in non-kiosk mode (UI visible)
  const clockBarShowInKiosk = ref(false); // Show bar in kiosk mode (UI hidden)
  const clockBarPosition = ref("top"); // Bar position (depends on mode): horizontal: 'top' | 'bottom' | 'between', vertical: 'left' | 'right' | 'between'
  const clockBarFontSize = ref(16); // Bar clock font size in pixels
  const clockBarDateFontSize = ref(14); // Bar clock date font size in pixels
  const clockBarLayout = ref("single-line"); // Bar layout: 'single-line' | 'two-lines'
  const clockBarPadding = ref(8); // Bar padding in pixels (all sides)
  const clockBarShowWeather = ref(false); // Show weather icon in horizontal clock bar
  const mealPlanCardSize = ref("medium"); // Meal plan card size: 'small' | 'medium' | 'large'
  const consoleLogEnabled = ref(true); // Enable console logging (default: true for backwards compatibility)
  const consoleLogLevel = ref("info"); // Console log level: 'error' | 'warn' | 'info' | 'debug' (default: 'info')
  const configPollInterval = ref(30); // Config polling interval in seconds (default: 30)
  const devMode = ref(false); // Whether the backend is running in dev mode (backend/.dev marker file)
  const loading = ref(false);
  const error = ref(null);

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
      // Update all config values to ensure reactivity
      if (response.data.orientation !== undefined) {
        orientation.value = response.data.orientation;
      }
      if (response.data.orientationFlipped !== undefined) {
        orientationFlipped.value = response.data.orientationFlipped;
      } else if (response.data.orientation_flipped !== undefined) {
        orientationFlipped.value = response.data.orientation_flipped;
      }
      if (response.data.lastSideViewMode !== undefined) {
        lastSideViewMode.value = response.data.lastSideViewMode;
      } else if (response.data.last_side_view_mode !== undefined) {
        lastSideViewMode.value = response.data.last_side_view_mode;
      } else {
        lastSideViewMode.value = "photos"; // Default
      }
      if (response.data.calendarSplit !== undefined) {
        calendarSplit.value = response.data.calendarSplit;
      }
      if (response.data.calendar_split !== undefined) {
        calendarSplit.value = response.data.calendar_split;
      }
      if (response.data.dashboardLayout !== undefined) {
        dashboardLayout.value = normalizeDashboardLayout(response.data.dashboardLayout, {
          calendarSplit: calendarSplit.value,
          lastSideViewMode: lastSideViewMode.value,
        });
      } else if (response.data.dashboard_layout !== undefined) {
        dashboardLayout.value = normalizeDashboardLayout(response.data.dashboard_layout, {
          calendarSplit: calendarSplit.value,
          lastSideViewMode: lastSideViewMode.value,
        });
      } else {
        dashboardLayout.value = normalizeDashboardLayout(null, {
          calendarSplit: calendarSplit.value,
          lastSideViewMode: lastSideViewMode.value,
        });
      }
      if (response.data.dashboardScreens !== undefined) {
        dashboardScreens.value = normalizeDashboardScreens(response.data.dashboardScreens);
      } else if (response.data.dashboard_screens !== undefined) {
        dashboardScreens.value = normalizeDashboardScreens(response.data.dashboard_screens);
      } else {
        dashboardScreens.value = normalizeDashboardScreens(null);
      }
      if (response.data.photoFrameEnabled !== undefined) {
        photoFrameEnabled.value = response.data.photoFrameEnabled;
      }
      if (response.data.photo_frame_enabled !== undefined) {
        photoFrameEnabled.value = response.data.photo_frame_enabled;
      }
      if (response.data.photoFrameTimeout !== undefined) {
        photoFrameTimeout.value = response.data.photoFrameTimeout;
      }
      if (response.data.photo_frame_timeout !== undefined) {
        photoFrameTimeout.value = response.data.photo_frame_timeout;
      }
      if (response.data.showUI !== undefined) {
        showUI.value = response.data.showUI;
      }
      if (response.data.show_ui !== undefined) {
        showUI.value = response.data.show_ui;
      }
      if (response.data.photoRotationInterval !== undefined) {
        photoRotationInterval.value = response.data.photoRotationInterval;
      }
      if (response.data.photo_rotation_interval !== undefined) {
        photoRotationInterval.value = response.data.photo_rotation_interval;
      }
      if (response.data.calendarViewMode !== undefined) {
        calendarViewMode.value = response.data.calendarViewMode;
      }
      if (response.data.calendar_view_mode !== undefined) {
        calendarViewMode.value = response.data.calendar_view_mode;
      }
      if (response.data.calendarRefreshInterval !== undefined) {
        calendarRefreshInterval.value = response.data.calendarRefreshInterval;
      } else if (response.data.calendar_refresh_interval !== undefined) {
        calendarRefreshInterval.value = response.data.calendar_refresh_interval;
      }
      if (response.data.timeFormat !== undefined) {
        timeFormat.value = response.data.timeFormat;
      }
      if (response.data.time_format !== undefined) {
        timeFormat.value = response.data.time_format;
      }
      if (response.data.modeIndicatorTimeout !== undefined) {
        modeIndicatorTimeout.value = response.data.modeIndicatorTimeout;
      }
      if (response.data.mode_indicator_timeout !== undefined) {
        modeIndicatorTimeout.value = response.data.mode_indicator_timeout;
      }
      if (response.data.keyboardFeedbackEnabled !== undefined) {
        keyboardFeedbackEnabled.value = response.data.keyboardFeedbackEnabled;
      }
      if (response.data.keyboard_feedback_enabled !== undefined) {
        keyboardFeedbackEnabled.value = response.data.keyboard_feedback_enabled;
      }
      if (response.data.keyboardFeedbackMode !== undefined) {
        keyboardFeedbackMode.value = response.data.keyboardFeedbackMode;
      }
      if (response.data.keyboard_feedback_mode !== undefined) {
        keyboardFeedbackMode.value = response.data.keyboard_feedback_mode;
      }
      if (response.data.weekStartDay !== undefined) {
        weekStartDay.value = response.data.weekStartDay;
      }
      if (response.data.week_start_day !== undefined) {
        weekStartDay.value = response.data.week_start_day;
      }
      if (response.data.showWeekNumbers !== undefined) {
        showWeekNumbers.value = response.data.showWeekNumbers;
      }
      if (response.data.show_week_numbers !== undefined) {
        showWeekNumbers.value = response.data.show_week_numbers;
      }
      if (response.data.weekendDays !== undefined) {
        weekendDays.value = response.data.weekendDays;
      }
      if (response.data.weekend_days !== undefined) {
        weekendDays.value = response.data.weekend_days;
      }
      if (response.data.showRedDays !== undefined) {
        showRedDays.value = response.data.showRedDays;
      }
      if (response.data.show_red_days !== undefined) {
        showRedDays.value = response.data.show_red_days;
      }
      if (response.data.maxVisibleEvents !== undefined) {
        maxVisibleEvents.value = response.data.maxVisibleEvents;
      }
      if (response.data.max_visible_events !== undefined) {
        maxVisibleEvents.value = response.data.max_visible_events;
      }
      if (response.data.sideViewPosition !== undefined) {
        sideViewPosition.value = response.data.sideViewPosition;
      }
      if (response.data.side_view_position !== undefined) {
        sideViewPosition.value = response.data.side_view_position;
      }
      if (response.data.themeMode !== undefined) {
        themeMode.value = response.data.themeMode;
      }
      if (response.data.theme_mode !== undefined) {
        themeMode.value = response.data.theme_mode;
      }
      if (response.data.selectedTheme !== undefined) {
        selectedTheme.value = response.data.selectedTheme;
      }
      if (response.data.selected_theme !== undefined) {
        selectedTheme.value = response.data.selected_theme;
      }
      if (response.data.darkModeStart !== undefined) {
        darkModeStart.value = response.data.darkModeStart;
      }
      if (response.data.dark_mode_start !== undefined) {
        darkModeStart.value = response.data.dark_mode_start;
      }
      if (response.data.darkModeEnd !== undefined) {
        darkModeEnd.value = response.data.darkModeEnd;
      }
      if (response.data.dark_mode_end !== undefined) {
        darkModeEnd.value = response.data.dark_mode_end;
      }
      if (response.data.displayScheduleEnabled !== undefined) {
        displayScheduleEnabled.value = response.data.displayScheduleEnabled;
      }
      if (response.data.display_schedule_enabled !== undefined) {
        displayScheduleEnabled.value = response.data.display_schedule_enabled;
      }
      if (response.data.displaySchedule !== undefined) {
        if (typeof response.data.displaySchedule === "string") {
          displaySchedule.value = JSON.parse(response.data.displaySchedule);
        } else {
          displaySchedule.value = response.data.displaySchedule;
        }
      }
      if (response.data.display_schedule !== undefined) {
        if (typeof response.data.display_schedule === "string") {
          displaySchedule.value = JSON.parse(response.data.display_schedule);
        } else {
          displaySchedule.value = response.data.display_schedule;
        }
      }
      if (response.data.displayTimeoutEnabled !== undefined) {
        displayTimeoutEnabled.value = response.data.displayTimeoutEnabled;
      }
      if (response.data.display_timeout_enabled !== undefined) {
        displayTimeoutEnabled.value = response.data.display_timeout_enabled;
      }
      if (response.data.displayTimeout !== undefined) {
        displayTimeout.value = response.data.displayTimeout;
      }
      if (response.data.display_timeout !== undefined) {
        displayTimeout.value = response.data.display_timeout;
      }
      if (response.data.rebootComboKey1 !== undefined) {
        rebootComboKey1.value = response.data.rebootComboKey1;
      }
      if (response.data.reboot_combo_key1 !== undefined) {
        rebootComboKey1.value = response.data.reboot_combo_key1;
      }
      if (response.data.rebootComboKey2 !== undefined) {
        rebootComboKey2.value = response.data.rebootComboKey2;
      }
      if (response.data.reboot_combo_key2 !== undefined) {
        rebootComboKey2.value = response.data.reboot_combo_key2;
      }
      if (response.data.rebootComboDuration !== undefined) {
        rebootComboDuration.value = response.data.rebootComboDuration;
      }
      if (response.data.reboot_combo_duration !== undefined) {
        rebootComboDuration.value = response.data.reboot_combo_duration;
      }
      if (response.data.imageDisplayMode !== undefined) {
        imageDisplayMode.value = response.data.imageDisplayMode;
      }
      if (response.data.image_display_mode !== undefined) {
        imageDisplayMode.value = response.data.image_display_mode;
      }
      // Handle timezone - can be null, undefined, or a string
      if (response.data.timezone !== undefined) {
        timezone.value = response.data.timezone ?? null;
      } else {
        // Ensure timezone is always set (default to null if not provided)
        timezone.value = null;
      }
      // Handle clock settings
      if (response.data.clockEnabled !== undefined) {
        clockEnabled.value = response.data.clockEnabled;
      } else if (response.data.clock_enabled !== undefined) {
        clockEnabled.value = response.data.clock_enabled;
      }
      if (response.data.clockDisplayMode !== undefined) {
        clockDisplayMode.value = response.data.clockDisplayMode;
      } else if (response.data.clock_display_mode !== undefined) {
        clockDisplayMode.value = response.data.clock_display_mode;
      } else {
        clockDisplayMode.value = "header"; // Default
      }
      if (response.data.clockShowDate !== undefined) {
        clockShowDate.value = response.data.clockShowDate;
      } else if (response.data.clock_show_date !== undefined) {
        clockShowDate.value = response.data.clock_show_date;
      }
      if (response.data.clockShowSeconds !== undefined) {
        clockShowSeconds.value = response.data.clockShowSeconds;
      } else if (response.data.clock_show_seconds !== undefined) {
        clockShowSeconds.value = response.data.clock_show_seconds;
      }
      if (response.data.clockPosition !== undefined) {
        clockPosition.value = response.data.clockPosition;
      } else if (response.data.clock_position !== undefined) {
        clockPosition.value = response.data.clock_position;
      } else {
        clockPosition.value = "top-right"; // Default
      }
      if (response.data.clockSize !== undefined) {
        clockSize.value = response.data.clockSize;
      } else if (response.data.clock_size !== undefined) {
        clockSize.value = response.data.clock_size;
      } else {
        clockSize.value = "medium"; // Default
      }
      // New clock settings
      if (response.data.clockWidgetEnabled !== undefined) {
        clockWidgetEnabled.value = response.data.clockWidgetEnabled;
      } else if (response.data.clock_widget_enabled !== undefined) {
        clockWidgetEnabled.value = response.data.clock_widget_enabled;
      }
      if (response.data.clockWidgetShowInKiosk !== undefined) {
        clockWidgetShowInKiosk.value = response.data.clockWidgetShowInKiosk;
      } else if (response.data.clock_widget_show_in_kiosk !== undefined) {
        clockWidgetShowInKiosk.value = response.data.clock_widget_show_in_kiosk;
      }
      if (response.data.clockWidgetPosition !== undefined) {
        clockWidgetPosition.value = response.data.clockWidgetPosition;
      } else if (response.data.clock_widget_position !== undefined) {
        clockWidgetPosition.value = response.data.clock_widget_position;
      } else {
        clockWidgetPosition.value = "top-right"; // Default
      }
      if (response.data.clockBarEnabled !== undefined) {
        clockBarEnabled.value = response.data.clockBarEnabled;
      } else if (response.data.clock_bar_enabled !== undefined) {
        clockBarEnabled.value = response.data.clock_bar_enabled;
      }
      if (response.data.clockBarMode !== undefined) {
        clockBarMode.value = response.data.clockBarMode;
      } else if (response.data.clock_bar_mode !== undefined) {
        clockBarMode.value = response.data.clock_bar_mode;
      } else {
        clockBarMode.value = "horizontal"; // Default
      }
      if (response.data.clockBarShowInNonKiosk !== undefined) {
        clockBarShowInNonKiosk.value = response.data.clockBarShowInNonKiosk;
      } else if (response.data.clock_bar_show_in_non_kiosk !== undefined) {
        clockBarShowInNonKiosk.value = response.data.clock_bar_show_in_non_kiosk;
      }
      if (response.data.clockBarShowInKiosk !== undefined) {
        clockBarShowInKiosk.value = response.data.clockBarShowInKiosk;
      } else if (response.data.clock_bar_show_in_kiosk !== undefined) {
        clockBarShowInKiosk.value = response.data.clock_bar_show_in_kiosk;
      }
      if (response.data.clockBarPosition !== undefined) {
        clockBarPosition.value = response.data.clockBarPosition;
      } else if (response.data.clock_bar_position !== undefined) {
        clockBarPosition.value = response.data.clock_bar_position;
      } else {
        clockBarPosition.value = "top"; // Default
      }
      if (response.data.clockBarFontSize !== undefined) {
        clockBarFontSize.value = response.data.clockBarFontSize;
      } else if (response.data.clock_bar_font_size !== undefined) {
        clockBarFontSize.value = response.data.clock_bar_font_size;
      } else {
        clockBarFontSize.value = 16; // Default
      }
      if (response.data.clockBarDateFontSize !== undefined) {
        clockBarDateFontSize.value = response.data.clockBarDateFontSize;
      } else if (response.data.clock_bar_date_font_size !== undefined) {
        clockBarDateFontSize.value = response.data.clock_bar_date_font_size;
      } else {
        clockBarDateFontSize.value = 14; // Default
      }
      if (response.data.clockBarLayout !== undefined) {
        clockBarLayout.value = response.data.clockBarLayout;
      } else if (response.data.clock_bar_layout !== undefined) {
        clockBarLayout.value = response.data.clock_bar_layout;
      } else {
        clockBarLayout.value = "single-line"; // Default
      }
      if (response.data.clockBarPadding !== undefined) {
        clockBarPadding.value = response.data.clockBarPadding;
      } else if (response.data.clock_bar_padding !== undefined) {
        clockBarPadding.value = response.data.clock_bar_padding;
      } else {
        clockBarPadding.value = 8; // Default
      }
      if (response.data.clockBarShowWeather !== undefined) {
        clockBarShowWeather.value = response.data.clockBarShowWeather;
      } else if (response.data.clock_bar_show_weather !== undefined) {
        clockBarShowWeather.value = response.data.clock_bar_show_weather;
      }
      if (response.data.mealPlanCardSize !== undefined) {
        mealPlanCardSize.value = response.data.mealPlanCardSize;
      } else if (response.data.meal_plan_card_size !== undefined) {
        mealPlanCardSize.value = response.data.meal_plan_card_size;
      } else {
        mealPlanCardSize.value = "medium"; // Default
      }
      if (response.data.consoleLogEnabled !== undefined) {
        consoleLogEnabled.value = response.data.consoleLogEnabled;
      } else if (response.data.console_log_enabled !== undefined) {
        consoleLogEnabled.value = response.data.console_log_enabled;
      } else {
        consoleLogEnabled.value = true; // Default to enabled for backwards compatibility
      }
      if (response.data.consoleLogLevel !== undefined) {
        consoleLogLevel.value = response.data.consoleLogLevel;
      } else if (response.data.console_log_level !== undefined) {
        consoleLogLevel.value = response.data.console_log_level;
      } else {
        consoleLogLevel.value = "info"; // Default to 'info' level
      }
      if (response.data.configPollInterval !== undefined) {
        configPollInterval.value = response.data.configPollInterval;
      } else if (response.data.config_poll_interval !== undefined) {
        configPollInterval.value = response.data.config_poll_interval;
      } else {
        configPollInterval.value = 30; // Default to 30 seconds
      }
      if (response.data.devMode !== undefined) {
        devMode.value = response.data.devMode;
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[ConfigStore]", "Failed to fetch config:", err);
    } finally {
      loading.value = false;
    }
  };

  const updateConfig = async config => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.post("/api/config", config);
      // Update local config from response or from the config object passed in
      if (config.orientation !== undefined) {
        orientation.value = config.orientation;
      }
      if (config.orientationFlipped !== undefined) {
        orientationFlipped.value = config.orientationFlipped;
      }
      if (config.applyDisplayRotation !== undefined) {
        applyDisplayRotation.value = config.applyDisplayRotation;
      } else if (config.apply_display_rotation !== undefined) {
        applyDisplayRotation.value = config.apply_display_rotation;
      }
      if (config.lastSideViewMode !== undefined) {
        lastSideViewMode.value = config.lastSideViewMode;
      }
      if (config.calendarSplit !== undefined) {
        calendarSplit.value = config.calendarSplit;
      }
      if (config.dashboardLayout !== undefined) {
        dashboardLayout.value = normalizeDashboardLayout(config.dashboardLayout, {
          calendarSplit: calendarSplit.value,
          lastSideViewMode: lastSideViewMode.value,
        });
      } else if (config.dashboard_layout !== undefined) {
        dashboardLayout.value = normalizeDashboardLayout(config.dashboard_layout, {
          calendarSplit: calendarSplit.value,
          lastSideViewMode: lastSideViewMode.value,
        });
      }
      if (config.dashboardScreens !== undefined) {
        dashboardScreens.value = normalizeDashboardScreens(config.dashboardScreens);
      } else if (config.dashboard_screens !== undefined) {
        dashboardScreens.value = normalizeDashboardScreens(config.dashboard_screens);
      }
      if (config.showWeekNumbers !== undefined) {
        showWeekNumbers.value = config.showWeekNumbers;
      } else if (config.show_week_numbers !== undefined) {
        showWeekNumbers.value = config.show_week_numbers;
      }
      if (config.timeFormat !== undefined) {
        timeFormat.value = config.timeFormat;
      } else if (config.time_format !== undefined) {
        timeFormat.value = config.time_format;
      }
      if (config.maxVisibleEvents !== undefined) {
        maxVisibleEvents.value = config.maxVisibleEvents;
      } else if (config.max_visible_events !== undefined) {
        maxVisibleEvents.value = config.max_visible_events;
      }
      if (config.weekendDays !== undefined) {
        weekendDays.value = config.weekendDays;
      } else if (config.weekend_days !== undefined) {
        weekendDays.value = config.weekend_days;
      }
      if (config.showRedDays !== undefined) {
        showRedDays.value = config.showRedDays;
      } else if (config.show_red_days !== undefined) {
        showRedDays.value = config.show_red_days;
      }
      if (config.mealPlanCardSize !== undefined) {
        mealPlanCardSize.value = config.mealPlanCardSize;
      } else if (config.meal_plan_card_size !== undefined) {
        mealPlanCardSize.value = config.meal_plan_card_size;
      }
      if (config.showUI !== undefined) {
        showUI.value = config.showUI;
      } else if (config.show_ui !== undefined) {
        showUI.value = config.show_ui;
      }
      // Also check response data in case backend returns it
      if (response.data?.showUI !== undefined) {
        showUI.value = response.data.showUI;
      } else if (response.data?.show_ui !== undefined) {
        showUI.value = response.data.show_ui;
      }
      if (config.clockPosition !== undefined) {
        clockPosition.value = config.clockPosition;
      } else if (config.clock_position !== undefined) {
        clockPosition.value = config.clock_position;
      }
      if (config.clockEnabled !== undefined) {
        clockEnabled.value = config.clockEnabled;
      } else if (config.clock_enabled !== undefined) {
        clockEnabled.value = config.clock_enabled;
      }
      if (config.clockDisplayMode !== undefined) {
        clockDisplayMode.value = config.clockDisplayMode;
      } else if (config.clock_display_mode !== undefined) {
        clockDisplayMode.value = config.clock_display_mode;
      }
      if (config.clockShowDate !== undefined) {
        clockShowDate.value = config.clockShowDate;
      } else if (config.clock_show_date !== undefined) {
        clockShowDate.value = config.clock_show_date;
      }
      if (config.clockShowSeconds !== undefined) {
        clockShowSeconds.value = config.clockShowSeconds;
      } else if (config.clock_show_seconds !== undefined) {
        clockShowSeconds.value = config.clock_show_seconds;
      }
      if (config.clockSize !== undefined) {
        clockSize.value = config.clockSize;
      } else if (config.clock_size !== undefined) {
        clockSize.value = config.clock_size;
      }
      // New clock settings
      if (config.clockWidgetEnabled !== undefined) {
        clockWidgetEnabled.value = config.clockWidgetEnabled;
      } else if (config.clock_widget_enabled !== undefined) {
        clockWidgetEnabled.value = config.clock_widget_enabled;
      }
      if (config.clockWidgetShowInKiosk !== undefined) {
        clockWidgetShowInKiosk.value = config.clockWidgetShowInKiosk;
      } else if (config.clock_widget_show_in_kiosk !== undefined) {
        clockWidgetShowInKiosk.value = config.clock_widget_show_in_kiosk;
      }
      if (config.clockWidgetPosition !== undefined) {
        clockWidgetPosition.value = config.clockWidgetPosition;
      } else if (config.clock_widget_position !== undefined) {
        clockWidgetPosition.value = config.clock_widget_position;
      }
      if (config.clockBarEnabled !== undefined) {
        clockBarEnabled.value = config.clockBarEnabled;
      } else if (config.clock_bar_enabled !== undefined) {
        clockBarEnabled.value = config.clock_bar_enabled;
      }
      if (config.clockBarMode !== undefined) {
        clockBarMode.value = config.clockBarMode;
      } else if (config.clock_bar_mode !== undefined) {
        clockBarMode.value = config.clock_bar_mode;
      }
      if (config.clockBarShowInNonKiosk !== undefined) {
        clockBarShowInNonKiosk.value = config.clockBarShowInNonKiosk;
      } else if (config.clock_bar_show_in_non_kiosk !== undefined) {
        clockBarShowInNonKiosk.value = config.clock_bar_show_in_non_kiosk;
      }
      if (config.clockBarShowInKiosk !== undefined) {
        clockBarShowInKiosk.value = config.clockBarShowInKiosk;
      } else if (config.clock_bar_show_in_kiosk !== undefined) {
        clockBarShowInKiosk.value = config.clock_bar_show_in_kiosk;
      }
      if (config.clockBarPosition !== undefined) {
        clockBarPosition.value = config.clockBarPosition;
      } else if (config.clock_bar_position !== undefined) {
        clockBarPosition.value = config.clock_bar_position;
      }
      if (config.clockBarFontSize !== undefined) {
        clockBarFontSize.value = config.clockBarFontSize;
      } else if (config.clock_bar_font_size !== undefined) {
        clockBarFontSize.value = config.clock_bar_font_size;
      }
      if (config.clockBarDateFontSize !== undefined) {
        clockBarDateFontSize.value = config.clockBarDateFontSize;
      } else if (config.clock_bar_date_font_size !== undefined) {
        clockBarDateFontSize.value = config.clock_bar_date_font_size;
      }
      if (config.clockBarLayout !== undefined) {
        clockBarLayout.value = config.clockBarLayout;
      } else if (config.clock_bar_layout !== undefined) {
        clockBarLayout.value = config.clock_bar_layout;
      }
      if (config.clockBarPadding !== undefined) {
        clockBarPadding.value = config.clockBarPadding;
      } else if (config.clock_bar_padding !== undefined) {
        clockBarPadding.value = config.clock_bar_padding;
      }
      if (config.clockBarShowWeather !== undefined) {
        clockBarShowWeather.value = config.clockBarShowWeather;
      } else if (config.clock_bar_show_weather !== undefined) {
        clockBarShowWeather.value = config.clock_bar_show_weather;
      }
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

  const setCalendarViewMode = mode => {
    calendarViewMode.value = mode;
  };

  const cycleCalendarViewMode = async () => {
    // Cycle through: month -> week -> day -> month
    const modes = ["month", "week", "day"];
    const currentIndex = modes.indexOf(calendarViewMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    calendarViewMode.value = newMode;

    // Persist to backend
    try {
      await updateConfig({ calendarViewMode: newMode });
    } catch (err) {
      logError("[ConfigStore]", "Failed to save calendar view mode:", err);
    }

    return newMode;
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

  const setSideViewPosition = position => {
    sideViewPosition.value = position;
  };

  const toggleSideViewPosition = () => {
    if (orientation.value === "landscape") {
      // Toggle between left and right
      sideViewPosition.value = sideViewPosition.value === "right" ? "left" : "right";
    } else {
      // Toggle between top and bottom
      sideViewPosition.value = sideViewPosition.value === "bottom" ? "top" : "bottom";
    }
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
    calendarViewMode,
    calendarRefreshInterval,
    timeFormat,
    weekStartDay,
    showWeekNumbers,
    weekendDays,
    showRedDays,
    maxVisibleEvents,
    sideViewPosition,
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
    clockEnabled,
    clockDisplayMode,
    clockShowDate,
    clockShowSeconds,
    clockPosition,
    clockSize,
    clockWidgetEnabled,
    clockWidgetShowInKiosk,
    clockWidgetPosition,
    clockBarEnabled,
    clockBarMode,
    clockBarShowInNonKiosk,
    clockBarShowInKiosk,
    clockBarPosition,
    clockBarFontSize,
    clockBarDateFontSize,
    clockBarLayout,
    clockBarPadding,
    clockBarShowWeather,
    mealPlanCardSize,
    consoleLogEnabled,
    consoleLogLevel,
    configPollInterval,
    devMode,
    loading,
    error,
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
    setCalendarViewMode,
    cycleCalendarViewMode,
    setTimeFormat,
    setWeekStartDay,
    setShowWeekNumbers,
    setWeekendDays,
    setShowRedDays,
    setMaxVisibleEvents,
    setSideViewPosition,
    toggleSideViewPosition,
    setDashboardScreens,
    activateDashboardScreen,
    cycleDashboardScreenBy,
    cycleActiveDashboardRegionBy,
    setThemeMode,
    setDarkModeTime,
    setImageDisplayMode,
    fetchConfig,
    updateConfig,
  };
});
