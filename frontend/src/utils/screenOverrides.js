// Default-is-a-screen helpers (docs/design/2026-10-30-default-screen.md).
//
// A screen's overrides are one flat object on the kiosk. Two different readings
// matter to the pages:
//   - every key except `displayName` is a *setting* that can differ from the
//     Default screen (the name is the screen's own label, not a setting);
//   - only a subset can be promoted with "Use these as the default" — pages and
//     the name are never copied to the Default.

// Settings a screen can take from Default, and that "Use these as the default"
// copies into the global config.
export const DEFAULT_COPYABLE_KEYS = [
  "orientation",
  "orientationFlipped",
  "applyDisplayRotation",
  "displayScheduleEnabled",
  "displaySchedule",
  "displayTimeoutEnabled",
  "displayTimeout",
  "touchControls",
  "onScreenKeyboard",
];

// Pages are overrides too, but they describe what this screen shows rather than
// how it behaves; the Default keeps its own page list.
export const PAGE_OVERRIDE_KEYS = ["availableScreens", "defaultScreenId"];

// Human labels for the confirm copy and the "keeps its own …" note.
export const SCREEN_SETTING_LABELS = {
  orientation: "Orientation",
  orientationFlipped: "Upside down",
  applyDisplayRotation: "Rotate the screen output",
  displayScheduleEnabled: "Screen on/off schedule",
  displaySchedule: "Daily schedule",
  displayTimeoutEnabled: "Turn off when idle",
  displayTimeout: "Turn off when idle",
  touchControls: "Touchscreen",
  onScreenKeyboard: "Show it",
  availableScreens: "Pages shown",
  defaultScreenId: "Start page",
};

// Keys that make a screen's *settings* differ from Default. The name does not
// count: every screen can be called something without deviating from Default.
// The idle row writes two keys (enabled + seconds) but is one setting.
export const changedSettingKeys = overrides => {
  const keys = Object.keys(overrides || {}).filter(key => key !== "displayName");
  const idleKey =
    "displayTimeoutEnabled" in (overrides || {}) || "displayTimeout" in (overrides || {});
  const settings = keys.filter(key => key !== "displayTimeoutEnabled" && key !== "displayTimeout");
  if (idleKey) settings.push("displayTimeout");
  return settings;
};

export const changedSettingCount = overrides => changedSettingKeys(overrides).length;

export const hasOwnSettings = overrides => changedSettingCount(overrides) > 0;

// Screens that override one Default key, in list order.
export const screensOverriding = (screens, key) =>
  (screens || []).filter(screen => key in (screen?.overrides || {}));

// "Hallway", "Hallway and Kitchen", "Hallway, Kitchen and Office".
export const joinNames = names => {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

// "Orientation", "Orientation and Upside down", "Orientation, Upside down and …".
export const formatSettingList = keys =>
  joinNames((keys || []).map(key => SCREEN_SETTING_LABELS[key] || key));

// The global config patch that makes a screen's overrides the Default, and the
// override object left on that screen afterwards (name and pages untouched).
export const useAsDefaultPatch = overrides => {
  const patch = {};
  for (const key of DEFAULT_COPYABLE_KEYS) {
    if (overrides && key in overrides) patch[key] = overrides[key];
  }
  return patch;
};

export const withoutPromotedSettings = overrides => {
  const next = { ...(overrides || {}) };
  for (const key of DEFAULT_COPYABLE_KEYS) delete next[key];
  return next;
};

// "Reset everything to default" keeps the name and drops every other override.
export const withoutAllOverrides = overrides => {
  const next = { ...(overrides || {}) };
  for (const key of Object.keys(next)) {
    if (key !== "displayName") delete next[key];
  }
  return next;
};
