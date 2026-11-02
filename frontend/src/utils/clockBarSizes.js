// Clock bar size presets (docs/design/2026-11-01-screen-schedule.md §4).
//
// The two bar shapes each have three presets; anything else is Custom and opens
// the three fine-tune rows. A preset writes the four stored keys, so the same
// config keeps working (the date size has no row of its own).

export const CLOCK_BAR_SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "custom", label: "Custom" },
];

const PRESETS = {
  horizontal: {
    // Medium is today's default 16 / 14 / 8 / 16.
    small: { time: 14, date: 12, padding: 4, plugin: 14 },
    medium: { time: 16, date: 14, padding: 8, plugin: 16 },
    large: { time: 24, date: 18, padding: 12, plugin: 20 },
  },
  vertical: {
    // Medium is today's side-bar default 18 / 11 / 8 / 16.
    small: { time: 14, date: 10, padding: 4, plugin: 14 },
    medium: { time: 18, date: 11, padding: 8, plugin: 16 },
    large: { time: 28, date: 14, padding: 12, plugin: 20 },
  },
};

/** The values a preset writes, or null for Custom / an unknown name. */
export function clockBarSizeValues(name, orientation = "horizontal") {
  return PRESETS[orientation]?.[name] || null;
}

/** Which preset a bar's current values match; "custom" otherwise. */
export function clockBarSizePreset({ time, padding, plugin }, orientation = "horizontal") {
  const match = Object.entries(PRESETS[orientation] || {}).find(
    ([, values]) =>
      values.time === Number(time) &&
      values.padding === Number(padding) &&
      values.plugin === Number(plugin)
  );
  return match ? match[0] : "custom";
}

/** Editor field → stored config key, per bar shape. */
export const CLOCK_BAR_SIZE_KEYS = {
  horizontal: {
    time: "clockBarFontSize",
    date: "clockBarDateFontSize",
    padding: "clockBarPadding",
    plugin: "clockBarPluginItemSize",
  },
  vertical: {
    time: "clockBarVerticalFontSize",
    date: "clockBarVerticalDateFontSize",
    padding: "clockBarVerticalPadding",
    plugin: "clockBarVerticalPluginItemSize",
  },
};

/** Turn a { time, padding, plugin } editor patch into a config patch. */
export function clockBarSizePatch(patch, orientation = "horizontal") {
  const keys = CLOCK_BAR_SIZE_KEYS[orientation] || CLOCK_BAR_SIZE_KEYS.horizontal;
  const config = {};
  for (const [field, value] of Object.entries(patch || {})) {
    if (keys[field]) config[keys[field]] = value;
  }
  return config;
}
