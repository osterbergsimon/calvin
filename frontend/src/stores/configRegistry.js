import { normalizeDashboardLayout, normalizeDashboardScreens } from "../utils/layout";

export const createDefaultDisplaySchedule = () => [
  { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 1, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 2, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 3, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 4, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" },
  { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" },
];

const cloneDefault = value => {
  if (typeof value === "function") return value();
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
};

const parseJsonString = (value, fallback) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const CONFIG_FIELD_DEFINITIONS = [
  { name: "orientation", keys: ["orientation"], defaultValue: "landscape" },
  {
    name: "orientationFlipped",
    keys: ["orientationFlipped", "orientation_flipped"],
    defaultValue: false,
  },
  {
    name: "applyDisplayRotation",
    keys: ["applyDisplayRotation", "apply_display_rotation"],
    defaultValue: true,
  },
  { name: "calendarSplit", keys: ["calendarSplit", "calendar_split"], defaultValue: 70 },
  {
    name: "sideViewPosition",
    keys: ["sideViewPosition", "side_view_position"],
    defaultValue: "right",
  },
  {
    name: "lastSideViewMode",
    keys: ["lastSideViewMode", "last_side_view_mode"],
    defaultValue: "photos",
  },
  {
    name: "dashboardLayout",
    keys: ["dashboardLayout", "dashboard_layout"],
    defaultValue: null,
    parse: (value, refsByName) =>
      normalizeDashboardLayout(value, {
        calendarSplit: refsByName.calendarSplit?.value ?? 70,
        lastSideViewMode: refsByName.lastSideViewMode?.value ?? "photos",
      }),
  },
  {
    name: "dashboardScreens",
    keys: ["dashboardScreens", "dashboard_screens"],
    defaultValue: null,
    parse: value => normalizeDashboardScreens(value),
  },
  {
    name: "photoFrameEnabled",
    keys: ["photoFrameEnabled", "photo_frame_enabled"],
    defaultValue: false,
  },
  {
    name: "photoFrameTimeout",
    keys: ["photoFrameTimeout", "photo_frame_timeout"],
    defaultValue: 300,
  },
  { name: "showUI", keys: ["showUI", "show_ui"], defaultValue: true },
  {
    name: "modeIndicatorTimeout",
    keys: ["modeIndicatorTimeout", "mode_indicator_timeout"],
    defaultValue: 5,
  },
  {
    name: "photoRotationInterval",
    keys: ["photoRotationInterval", "photo_rotation_interval"],
    defaultValue: 30,
  },
  {
    name: "calendarViewMode",
    keys: ["calendarViewMode", "calendar_view_mode"],
    defaultValue: "month",
  },
  {
    name: "calendarRefreshInterval",
    keys: ["calendarRefreshInterval", "calendar_refresh_interval"],
    defaultValue: 15,
  },
  { name: "timeFormat", keys: ["timeFormat", "time_format"], defaultValue: "24h" },
  { name: "weekStartDay", keys: ["weekStartDay", "week_start_day"], defaultValue: 1 },
  {
    name: "showWeekNumbers",
    keys: ["showWeekNumbers", "show_week_numbers"],
    defaultValue: false,
  },
  { name: "weekendDays", keys: ["weekendDays", "weekend_days"], defaultValue: [0, 6] },
  { name: "showRedDays", keys: ["showRedDays", "show_red_days"], defaultValue: false },
  {
    name: "maxVisibleEvents",
    keys: ["maxVisibleEvents", "max_visible_events"],
    defaultValue: 4,
  },
  { name: "themeMode", keys: ["themeMode", "theme_mode"], defaultValue: "auto" },
  { name: "selectedTheme", keys: ["selectedTheme", "selected_theme"], defaultValue: null },
  { name: "darkModeStart", keys: ["darkModeStart", "dark_mode_start"], defaultValue: 18 },
  { name: "darkModeEnd", keys: ["darkModeEnd", "dark_mode_end"], defaultValue: 6 },
  {
    name: "displayScheduleEnabled",
    keys: ["displayScheduleEnabled", "display_schedule_enabled"],
    defaultValue: false,
  },
  {
    name: "displaySchedule",
    keys: ["displaySchedule", "display_schedule"],
    defaultValue: createDefaultDisplaySchedule,
    parse: value => parseJsonString(value, createDefaultDisplaySchedule()),
  },
  {
    name: "displayTimeoutEnabled",
    keys: ["displayTimeoutEnabled", "display_timeout_enabled"],
    defaultValue: false,
  },
  { name: "displayTimeout", keys: ["displayTimeout", "display_timeout"], defaultValue: 0 },
  {
    name: "rebootComboKey1",
    keys: ["rebootComboKey1", "reboot_combo_key1"],
    defaultValue: "KEY_1",
  },
  {
    name: "rebootComboKey2",
    keys: ["rebootComboKey2", "reboot_combo_key2"],
    defaultValue: "KEY_7",
  },
  {
    name: "rebootComboDuration",
    keys: ["rebootComboDuration", "reboot_combo_duration"],
    defaultValue: 10000,
  },
  {
    name: "keyboardFeedbackEnabled",
    keys: ["keyboardFeedbackEnabled", "keyboard_feedback_enabled"],
    defaultValue: true,
  },
  {
    name: "keyboardFeedbackMode",
    keys: ["keyboardFeedbackMode", "keyboard_feedback_mode"],
    defaultValue: "normal",
  },
  {
    name: "imageDisplayMode",
    keys: ["imageDisplayMode", "image_display_mode"],
    defaultValue: "smart",
  },
  { name: "timezone", keys: ["timezone"], defaultValue: null, parse: value => value ?? null },
  { name: "clockShowDate", keys: ["clockShowDate", "clock_show_date"], defaultValue: false },
  {
    name: "clockShowSeconds",
    keys: ["clockShowSeconds", "clock_show_seconds"],
    defaultValue: false,
  },
  { name: "clockBarMode", keys: ["clockBarMode", "clock_bar_mode"], defaultValue: "horizontal" },
  {
    name: "clockBarShowInKiosk",
    keys: ["clockBarShowInKiosk", "clock_bar_show_in_kiosk"],
    defaultValue: false,
  },
  {
    name: "clockBarPosition",
    keys: ["clockBarPosition", "clock_bar_position"],
    defaultValue: "top",
  },
  {
    name: "clockBarFontSize",
    keys: ["clockBarFontSize", "clock_bar_font_size"],
    defaultValue: 16,
  },
  {
    name: "clockBarDateFontSize",
    keys: ["clockBarDateFontSize", "clock_bar_date_font_size"],
    defaultValue: 14,
  },
  {
    name: "clockBarLayout",
    keys: ["clockBarLayout", "clock_bar_layout"],
    defaultValue: "single-line",
    parse: value => (value === "two-lines" ? "two-lines" : "single-line"),
  },
  {
    name: "clockBarVerticalLayout",
    keys: ["clockBarVerticalLayout", "clock_bar_vertical_layout"],
    defaultValue: "upright",
    parse: value =>
      ["upright", "compact-time", "compact-time-date"].includes(value)
        ? value
        : value === "vertical-compact"
          ? "compact-time"
          : "upright",
  },
  {
    name: "clockBarVerticalFontSize",
    keys: ["clockBarVerticalFontSize", "clock_bar_vertical_font_size"],
    defaultValue: 18,
  },
  {
    name: "clockBarVerticalDateFontSize",
    keys: ["clockBarVerticalDateFontSize", "clock_bar_vertical_date_font_size"],
    defaultValue: 11,
  },
  {
    name: "clockBarVerticalPadding",
    keys: ["clockBarVerticalPadding", "clock_bar_vertical_padding"],
    defaultValue: 8,
  },
  { name: "clockBarPadding", keys: ["clockBarPadding", "clock_bar_padding"], defaultValue: 8 },
  {
    name: "clockBarShowWeather",
    keys: ["clockBarShowWeather", "clock_bar_show_weather"],
    defaultValue: false,
  },
  {
    name: "clockBarShowLogo",
    keys: ["clockBarShowLogo", "clock_bar_show_logo"],
    defaultValue: true,
  },
  {
    name: "displayName",
    keys: ["displayName", "display_name"],
    defaultValue: "",
  },
  {
    name: "focusLightMode",
    keys: ["focusLightMode", "focus_light_mode"],
    defaultValue: "interaction",
  },
  {
    name: "focusLightDimOthers",
    keys: ["focusLightDimOthers", "focus_light_dim_others"],
    defaultValue: true,
  },
  {
    name: "mealPlanCardSize",
    keys: ["mealPlanCardSize", "meal_plan_card_size"],
    defaultValue: "medium",
  },
  {
    name: "consoleLogEnabled",
    keys: ["consoleLogEnabled", "console_log_enabled"],
    defaultValue: true,
  },
  {
    name: "consoleLogLevel",
    keys: ["consoleLogLevel", "console_log_level"],
    defaultValue: "info",
  },
  {
    name: "configPollInterval",
    keys: ["configPollInterval", "config_poll_interval"],
    defaultValue: 30,
  },
  { name: "devMode", keys: ["devMode", "dev_mode"], defaultValue: false },
];

export const getConfigPayloadValue = (payload, field) => {
  for (const key of field.keys) {
    if (payload?.[key] !== undefined) {
      return { found: true, value: payload[key] };
    }
  }
  return { found: false, value: undefined };
};

export const applyConfigPayload = (payload, refsByName, { useDefaults = false } = {}) => {
  for (const field of CONFIG_FIELD_DEFINITIONS) {
    const targetRef = refsByName[field.name];
    if (!targetRef) continue;

    const { found, value } = getConfigPayloadValue(payload, field);
    if (!found && !useDefaults) continue;

    const rawValue = found ? value : cloneDefault(field.defaultValue);
    targetRef.value = field.parse ? field.parse(rawValue, refsByName) : rawValue;
  }
};
