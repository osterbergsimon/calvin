import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";

export const useConfigStore = defineStore("config", () => {
  const orientation = ref("landscape"); // 'landscape' | 'portrait'
  const calendarSplit = ref(70); // Percentage for calendar (66-75%, default 70%)
  const sideViewPosition = ref("right"); // 'left' | 'right' for landscape, 'top' | 'bottom' for portrait
  const showWebServices = ref(false); // Toggle for web services view
  const photoFrameEnabled = ref(false); // Photo frame mode enabled
  const photoFrameTimeout = ref(300); // Photo frame timeout in seconds (5 minutes default)
  const showUI = ref(true); // Show headers and UI controls (can be hidden for kiosk mode)
  const showModeIndicator = ref(true); // Show mode indicator icon (when UI is hidden)
  const modeIndicatorTimeout = ref(5); // Mode indicator auto-hide timeout in seconds (0 = never hide, default 5)
  const photoRotationInterval = ref(30); // Photo rotation interval in seconds (default 30)
  const calendarViewMode = ref("month"); // Calendar view mode: 'month' or 'rolling'
  const timeFormat = ref("24h"); // Time format: '12h' or '24h' (default: '24h')
  const weekStartDay = ref(0); // Week starting day (0=Sunday, 1=Monday, ..., 6=Saturday, default 0)
  const showWeekNumbers = ref(false); // Show week numbers in calendar (default false)
  const themeMode = ref("auto"); // Theme mode: 'light' | 'dark' | 'auto' | 'time'
  const darkModeStart = ref(18); // Dark mode start hour (0-23, default 18 = 6 PM)
  const darkModeEnd = ref(6); // Dark mode end hour (0-23, default 6 = 6 AM)
  const loading = ref(false);
  const error = ref(null);

  const setOrientation = (newOrientation) => {
    orientation.value = newOrientation;
  };

  const setCalendarSplit = (percentage) => {
    // Clamp between 66 and 75
    calendarSplit.value = Math.max(66, Math.min(75, percentage));
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
      if (response.data.orientation) {
        orientation.value = response.data.orientation;
      }
      if (response.data.calendarSplit !== undefined) {
        calendarSplit.value = response.data.calendarSplit;
      }
      if (response.data.calendar_split !== undefined) {
        calendarSplit.value = response.data.calendar_split;
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
      if (response.data.timeFormat !== undefined) {
        timeFormat.value = response.data.timeFormat;
      }
      if (response.data.time_format !== undefined) {
        timeFormat.value = response.data.time_format;
      }
      if (response.data.showModeIndicator !== undefined) {
        showModeIndicator.value = response.data.showModeIndicator;
      }
      if (response.data.show_mode_indicator !== undefined) {
        showModeIndicator.value = response.data.show_mode_indicator;
      }
      if (response.data.modeIndicatorTimeout !== undefined) {
        modeIndicatorTimeout.value = response.data.modeIndicatorTimeout;
      }
      if (response.data.mode_indicator_timeout !== undefined) {
        modeIndicatorTimeout.value = response.data.mode_indicator_timeout;
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
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to fetch config:", err);
    } finally {
      loading.value = false;
    }
  };

  const updateConfig = async (config) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.post("/api/config", config);
      // TODO: Update local config from response
      if (config.orientation) {
        orientation.value = config.orientation;
      }
      if (config.calendarSplit) {
        calendarSplit.value = config.calendarSplit;
      }
      return response.data;
    } catch (err) {
      error.value = err.message;
      console.error("Failed to update config:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const setPhotoFrameEnabled = (enabled) => {
    photoFrameEnabled.value = enabled;
  };

  const setPhotoFrameTimeout = (timeout) => {
    photoFrameTimeout.value = timeout;
  };

  const setShowUI = (show) => {
    showUI.value = show;
  };

  const toggleUI = () => {
    showUI.value = !showUI.value;
  };

  const setPhotoRotationInterval = (interval) => {
    photoRotationInterval.value = interval;
  };

  const setCalendarViewMode = (mode) => {
    calendarViewMode.value = mode;
  };

  const setTimeFormat = (format) => {
    timeFormat.value = format;
  };

  const setShowModeIndicator = (show) => {
    showModeIndicator.value = show;
  };

  const setModeIndicatorTimeout = (timeout) => {
    modeIndicatorTimeout.value = timeout;
  };

  const setWeekStartDay = (day) => {
    weekStartDay.value = Math.max(0, Math.min(6, day));
  };

  const setShowWeekNumbers = (show) => {
    showWeekNumbers.value = show;
  };

  const setSideViewPosition = (position) => {
    sideViewPosition.value = position;
  };

  const toggleSideViewPosition = () => {
    if (orientation.value === "landscape") {
      // Toggle between left and right
      sideViewPosition.value =
        sideViewPosition.value === "right" ? "left" : "right";
    } else {
      // Toggle between top and bottom
      sideViewPosition.value =
        sideViewPosition.value === "bottom" ? "top" : "bottom";
    }
  };

  const setThemeMode = (mode) => {
    themeMode.value = mode;
  };

  const setDarkModeTime = (start, end) => {
    darkModeStart.value = start;
    darkModeEnd.value = end;
  };

  return {
    orientation,
    calendarSplit,
    showWebServices,
    photoFrameEnabled,
    photoFrameTimeout,
    showUI,
    showModeIndicator,
    modeIndicatorTimeout,
    photoRotationInterval,
    calendarViewMode,
    timeFormat,
    weekStartDay,
    showWeekNumbers,
    sideViewPosition,
    themeMode,
    darkModeStart,
    darkModeEnd,
    loading,
    error,
    calendarWidth,
    photosWidth,
    setOrientation,
    setCalendarSplit,
    toggleWebServices,
    setPhotoFrameEnabled,
    setPhotoFrameTimeout,
    setShowUI,
    toggleUI,
    setShowModeIndicator,
    setModeIndicatorTimeout,
    setPhotoRotationInterval,
    setCalendarViewMode,
    setTimeFormat,
    setWeekStartDay,
    setShowWeekNumbers,
    setSideViewPosition,
    toggleSideViewPosition,
    setThemeMode,
    setDarkModeTime,
    fetchConfig,
    updateConfig,
  };
});
