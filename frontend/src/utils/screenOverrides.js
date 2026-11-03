// Default-is-a-screen helpers (docs/design/2026-10-30-default-screen.md).
//
// A screen's overrides are one flat object on the kiosk. Two different readings
// matter to the pages:
//   - every key except `displayName` is a *setting* that can differ from the
//     Default screen (the name is the screen's own label, not a setting);
//   - only a subset can be promoted with "Use these as the default" — pages and
//     the name are never copied to the Default.

import { EFFECTS_LEVEL_OPTIONS, normalizeEffectsLevel } from "./effectsLevel";
import { normalizeLayoutMode } from "./layoutMode";

const PHOTO_FRAME_MINUTES = [1, 2, 5, 10, 15, 30];

const minutesLabel = seconds => {
  if (seconds % 60 !== 0) return `${seconds} s`;
  return `${seconds / 60} min`;
};

const photoFrameTimeout = value => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
};

const IDLE_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
];

const idleLabel = seconds => {
  if (!seconds) return "Never";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
};

/**
 * One descriptor per per-screen setting (settings-scope §7 item 2).
 *
 * `control.kind` renders the row: segmented, toggle, select, number, the photo
 * source picker, or the schedule grid. `browserLayer` says a plain browser has
 * a localStorage choice of its own; without one it follows Default.
 *
 * Derived from this list: DEFAULT_COPYABLE_KEYS and SCREEN_SETTING_LABELS.
 */
export const SCREEN_SETTING_DESCRIPTORS = [
  {
    key: "effectsLevel",
    label: "Effects",
    section: "effects",
    description: "Full is the richest look. Standard keeps a slow screen such as a Pi 3B+ smooth.",
    control: { kind: "segmented", options: EFFECTS_LEVEL_OPTIONS },
    defaultValue: "auto",
    parse: normalizeEffectsLevel,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-effects-level",
    keywords: [
      "effects",
      "focus light",
      "focus",
      "dim",
      "performance",
      "motion",
      "animation",
      "standard",
      "full",
      "speed",
    ],
  },
  {
    key: "orientation",
    label: "Orientation",
    section: "display",
    description: "Which way the screen is mounted. Pages & regions decides how regions stack.",
    control: {
      kind: "segmented",
      options: [
        { value: "landscape", label: "Landscape" },
        { value: "portrait", label: "Portrait" },
      ],
    },
    defaultValue: "landscape",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-orientation-row",
    keywords: ["display", "orientation", "portrait", "landscape", "rotation"],
  },
  {
    key: "orientationFlipped",
    label: "Upside down",
    section: "display",
    description: "For screens mounted with the cable on top.",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-flip",
    keywords: ["display", "orientation", "flip", "rotate", "upside down", "mount"],
  },
  {
    key: "applyDisplayRotation",
    label: "Rotate the screen output",
    section: "display",
    description: "On: Calvin turns the Pi's picture itself. Off: leave it to the OS or the screen.",
    control: { kind: "toggle" },
    defaultValue: true,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-apply-rotation",
    keywords: ["display", "rotation", "rotate", "orientation", "pi", "output"],
  },
  {
    key: "displayScheduleEnabled",
    label: "Screen on/off schedule",
    section: "power",
    description: "Turns the screen off and on at set times.",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-schedule-enabled",
    keywords: ["power", "schedule", "screen off", "screen on", "night", "display"],
  },
  {
    key: "displaySchedule",
    label: "Schedule",
    section: "power",
    control: { kind: "schedule" },
    defaultValue: [],
    browserLayer: false,
    copyable: true,
    resetTest: "reset-daily-schedule",
    keywords: ["power", "schedule", "hours", "on time", "off time", "night", "display"],
  },
  {
    key: "displayTimeoutEnabled",
    label: "Turn off when idle",
    section: "power",
    description: "",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-idle-timeout",
    keywords: ["power", "idle", "timeout", "screensaver", "screen off", "display"],
  },
  {
    key: "displayTimeout",
    label: "Turn off when idle",
    section: "power",
    control: {
      kind: "select",
      options: IDLE_OPTIONS,
      keepCurrent: true,
      formatOption: idleLabel,
    },
    defaultValue: 0,
    parse: value => Math.max(0, Number(value) || 0),
    browserLayer: false,
    copyable: true,
    resetTest: "reset-idle-timeout",
    keywords: ["power", "idle", "timeout", "screensaver", "screen off", "display"],
  },
  {
    key: "touchControls",
    label: "Touchscreen",
    section: "touch",
    description:
      "Shows touch buttons: arrows, page dots and close. Auto works for most screens; choose On if a touch panel acts like a mouse.",
    control: {
      kind: "segmented",
      options: [
        { value: "auto", label: "Auto" },
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ],
    },
    defaultValue: "auto",
    browserLayer: true,
    copyable: true,
    resetTest: "reset-touchscreen",
    keywords: ["touch", "touchscreen", "buttons", "arrows", "page dots", "controls"],
  },
  {
    key: "onScreenKeyboard",
    label: "On-screen keyboard",
    section: "touch",
    description: "Auto shows it on touchscreens when you tap a text field.",
    control: {
      kind: "segmented",
      options: [
        { value: "auto", label: "Auto" },
        { value: "on", label: "Always" },
        { value: "off", label: "Never" },
      ],
    },
    defaultValue: "auto",
    browserLayer: true,
    copyable: true,
    resetTest: "osk-use-shared",
    keywords: ["keyboard", "on-screen keyboard", "touch", "letters", "keys"],
  },
  {
    key: "photoFrameEnabled",
    label: "Photo frame",
    section: "behaviour",
    description:
      "After a while with no touches or key presses, photos go full screen. Any touch brings the dashboard back.",
    control: {
      kind: "segmented",
      options: [
        { value: false, label: "Off" },
        { value: true, label: "On" },
      ],
    },
    defaultValue: false,
    parse: value => value === true || value === "true",
    browserLayer: false,
    copyable: false,
    resetTest: "reset-photo-frame",
    keywords: ["photo frame", "slideshow", "screensaver", "idle", "fullscreen", "photos"],
  },
  {
    key: "photoFrameTimeout",
    label: "Start after",
    section: "behaviour",
    ariaLabel: "Start the photo frame after",
    control: {
      kind: "select",
      options: PHOTO_FRAME_MINUTES.map(minutes => ({
        value: minutes * 60,
        label: `${minutes} min`,
      })),
      keepCurrent: true,
      formatOption: minutesLabel,
    },
    defaultValue: 300,
    parse: photoFrameTimeout,
    browserLayer: false,
    copyable: false,
    showWhen: "photoFrameEnabled",
    resetTest: "reset-photo-frame-timeout",
    keywords: ["photo frame", "start after", "timeout", "idle", "delay", "slideshow"],
  },
  {
    key: "photoFrameSourceIds",
    label: "Photos from",
    section: "behaviour",
    description: "All sources, or the photo sources this screen's frame uses.",
    control: { kind: "photoSources" },
    defaultValue: [],
    browserLayer: false,
    copyable: false,
    showWhen: "photoFrameEnabled",
    stacked: true,
    resetTest: "reset-photo-frame-sources",
    keywords: ["photo frame", "photos from", "sources", "album", "slideshow"],
  },
  {
    key: "loadingLight",
    label: "Loading light",
    section: "behaviour",
    description: "What Calvin shows while it's fetching something.",
    control: {
      kind: "segmented",
      options: [
        { value: "comet", label: "Comet" },
        { value: "pulse", label: "Pulse" },
        { value: "off", label: "Off" },
      ],
    },
    defaultValue: "comet",
    browserLayer: false,
    copyable: false,
    resetTest: "reset-loading-light",
    reducedMotionNote: "This device prefers less motion, so it pulses.",
    keywords: ["loading light", "loading", "comet", "pulse", "spinner", "motion"],
  },
  {
    key: "layoutMode",
    label: "Layout",
    section: "behaviour",
    description: "Auto follows the screen size. Force the desktop or phone layout on this screen.",
    control: {
      kind: "segmented",
      options: [
        { value: "auto", label: "Auto" },
        { value: "desktop", label: "Desktop" },
        { value: "phone", label: "Phone" },
      ],
    },
    defaultValue: "auto",
    parse: normalizeLayoutMode,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-layout-mode",
    keywords: ["layout", "desktop", "phone", "auto", "size", "display"],
  },
];

const DESCRIPTORS_BY_KEY = new Map(
  SCREEN_SETTING_DESCRIPTORS.map(descriptor => [descriptor.key, descriptor])
);

export const descriptorFor = key => DESCRIPTORS_BY_KEY.get(key) || null;

export const descriptorsForSection = section =>
  SCREEN_SETTING_DESCRIPTORS.filter(descriptor => descriptor.section === section);

// Settings a screen can take from Default, and that "Use these as the default"
// copies into the global config.
export const DEFAULT_COPYABLE_KEYS = SCREEN_SETTING_DESCRIPTORS.filter(
  descriptor => descriptor.copyable
).map(descriptor => descriptor.key);

// Pages are overrides too, but they describe what this screen shows rather than
// how it behaves; the Default keeps its own page list.
export const PAGE_OVERRIDE_KEYS = ["availableScreens", "defaultScreenId"];

// Human labels for the confirm copy and the "keeps its own …" note. The
// per-screen settings' labels come from their descriptor; pages are separate.
export const SCREEN_SETTING_LABELS = {
  ...Object.fromEntries(
    SCREEN_SETTING_DESCRIPTORS.map(descriptor => [descriptor.key, descriptor.label])
  ),
  availableScreens: "Pages shown",
  defaultScreenId: "Start page",
};

/** A value read as the descriptor's control expects it. */
export const normalizeSettingValue = (descriptor, value) => {
  if (!descriptor) return value;
  if (descriptor.parse) return descriptor.parse(value);
  const control = descriptor.control || {};
  if (control.kind === "toggle") return value === true || value === "true";
  if (control.kind === "segmented" || control.kind === "select") {
    const options = control.options || [];
    if (control.keepCurrent) {
      const number = Number(value);
      return Number.isFinite(number) ? number : descriptor.defaultValue;
    }
    if (options.length > 0) {
      return options.some(option => option.value === value)
        ? value
        : (descriptor.defaultValue ?? options[0].value);
    }
  }
  if (control.kind === "number") {
    const number = Number(value);
    const base = Number.isFinite(number) ? number : Number(descriptor.defaultValue ?? 0);
    return Math.min(control.max ?? Infinity, Math.max(control.min ?? -Infinity, base));
  }
  return value;
};

/** Select options, with a stored value outside the list as its own entry. */
export const settingControlOptions = (descriptor, value) => {
  const control = descriptor?.control || {};
  const options = (control.options || []).map(option => ({ ...option }));
  if (control.keepCurrent && options.length > 0) {
    const current = normalizeSettingValue(descriptor, value);
    if (!options.some(option => option.value === current)) {
      options.push({
        value: current,
        label: control.formatOption ? control.formatOption(current) : String(current),
      });
      options.sort((a, b) => a.value - b.value);
    }
  }
  return options;
};

/** Whether a row that depends on another setting is shown. */
export const isSettingVisible = (descriptor, values) => {
  if (!descriptor?.showWhen) return true;
  const shown = normalizeSettingValue(
    descriptorFor(descriptor.showWhen),
    values?.[descriptor.showWhen]
  );
  return shown === true || Boolean(shown);
};

export const visibleDescriptors = (descriptors, values) =>
  (descriptors || []).filter(descriptor => isSettingVisible(descriptor, values));

// Keys that are not durable settings, so they never make a screen "differ from
// Default": its own name, and the transient "Screen now" manual power choice
// (it expires at the schedule's next boundary and is not copied anywhere).
const NON_SETTING_KEYS = new Set(["displayName", "screenNow"]);

// Keys that make a screen's *settings* differ from Default. The name does not
// count: every screen can be called something without deviating from Default.
// The idle row writes two keys (enabled + seconds) but is one setting.
export const changedSettingKeys = overrides => {
  const keys = Object.keys(overrides || {}).filter(key => !NON_SETTING_KEYS.has(key));
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
