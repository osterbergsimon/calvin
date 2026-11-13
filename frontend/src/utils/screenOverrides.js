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
import { TYPE_THEMES } from "../styles/typeThemes";
import { UI_SIZE_OPTIONS } from "../styles/uiScale";

const PHOTO_FRAME_MINUTES = [1, 2, 5, 10, 15, 30];

const THEME_MODE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Follow device" },
  { value: "time", label: "On a schedule" },
];

const TYPE_THEME_OPTIONS = Object.keys(TYPE_THEMES).map(id => ({
  value: id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

const DASHBOARD_SIZE_OPTIONS = [
  { value: "xsmall", label: "X-Small" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "X-Large" },
];

const hourValue = value => {
  const hour = parseInt(String(value).split(":")[0], 10);
  return Number.isNaN(hour) ? 0 : Math.max(0, Math.min(23, hour));
};

const minutesLabel = seconds => {
  if (seconds % 60 !== 0) return `${seconds} s`;
  return `${seconds / 60} min`;
};

const photoFrameTimeout = value => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
};

// How long each photo shows: slideshow regions and the photo frame. Presets
// instead of a 5 s stepper, so ten minutes is one choice, not 114 taps. A
// stored value between presets (45 s) is kept and listed (keepCurrent).
const PHOTO_SHOW_SECONDS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

const photoShowSeconds = value => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 5 ? seconds : 30;
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
 * `perScreenOnly` marks a device-physical setting with no household value, so
 * Screens › Default has no row for it (brightness, calvin-29ws).
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
    key: "focusLightMode",
    label: "Focus light",
    section: "effects",
    description: "Outlines the region the remote or arrow keys will act on.",
    control: {
      kind: "select",
      options: [
        { value: "always", label: "Always" },
        { value: "interaction", label: "Only while controls show" },
        { value: "off", label: "Off" },
      ],
    },
    defaultValue: "interaction",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-focus-light",
    keywords: [
      "focus light",
      "focus",
      "spotlight",
      "remote",
      "arrow keys",
      "dim",
      "controls",
      "dashboard",
    ],
  },
  {
    key: "focusLightDimOthers",
    label: "Dim other regions",
    section: "effects",
    description: "Dims the rest while the focus light is on.",
    control: { kind: "toggle" },
    defaultValue: true,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-dim-others",
    keywords: ["dim", "focus light", "focus", "regions", "spotlight", "dashboard"],
  },
  {
    key: "keyboardFeedbackEnabled",
    label: "Show button presses",
    section: "effects",
    description: "A short label appears when a remote or keyboard button does something.",
    control: { kind: "toggle" },
    defaultValue: true,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-keyboard-feedback",
    keywords: [
      "button presses",
      "key press",
      "key-press",
      "keyboard feedback",
      "remote",
      "notifications",
      "focus & remote",
      "dashboard",
    ],
  },
  {
    key: "keyboardFeedbackMode",
    label: "Label size",
    section: "effects",
    control: {
      kind: "segmented",
      options: [
        { value: "normal", label: "Normal" },
        { value: "small", label: "Small" },
      ],
    },
    defaultValue: "normal",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-keyboard-feedback-mode",
    keywords: [
      "label size",
      "button presses",
      "keyboard feedback",
      "remote",
      "notifications",
      "focus & remote",
      "dashboard",
    ],
  },
  {
    key: "showUI",
    label: "Hide controls",
    section: "controls",
    description: "Hides the ⋯ menu and region headers for a calm wall display.",
    control: { kind: "toggle", invert: true },
    defaultValue: true,
    browserLayer: true,
    copyable: true,
    resetTest: "reset-hide-controls",
    keywords: ["hide controls", "controls", "show controls", "kiosk", "wall", "calm", "dashboard"],
  },
  {
    key: "clockBarShowInKiosk",
    label: "Keep the clock bar when hidden",
    section: "controls",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: true,
    copyable: true,
    resetTest: "reset-clock-bar-in-kiosk",
    keywords: ["clock bar", "keep clock bar", "controls", "hidden", "kiosk", "dashboard"],
  },
  {
    key: "tapAnywhereReveal",
    label: "Tap anywhere to show controls",
    section: "controls",
    description: "A tap on calendar or photos brings controls back.",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: true,
    copyable: true,
    resetTest: "reset-tap-anywhere-reveal",
    keywords: ["tap anywhere", "tap to reveal", "controls", "show controls", "kiosk", "dashboard"],
  },
  {
    key: "hotCornerPosition",
    label: "Show-controls corner",
    section: "controls",
    description: "Press and hold this corner to bring hidden controls back.",
    control: {
      kind: "select",
      options: [
        { value: "bottom-left", label: "Bottom left" },
        { value: "bottom-right", label: "Bottom right" },
        { value: "top-left", label: "Top left" },
        { value: "top-right", label: "Top right" },
      ],
    },
    defaultValue: "bottom-left",
    browserLayer: false,
    copyable: true,
    showWhen: { key: "showUI", equals: false },
    resetTest: "reset-hot-corner-position",
    keywords: [
      "hot corner",
      "corner",
      "show-controls corner",
      "reveal corner",
      "controls",
      "dashboard",
    ],
  },
  {
    key: "hotCornerOpacity",
    label: "Corner visibility",
    ariaLabel: "Corner visibility percentage",
    section: "controls",
    description: "At 0 it's invisible but still works.",
    control: { kind: "number", min: 0, max: 100, step: 5, unit: "%" },
    defaultValue: 55,
    browserLayer: false,
    copyable: true,
    showWhen: { key: "showUI", equals: false },
    resetTest: "reset-hot-corner-opacity",
    keywords: ["corner visibility", "hot corner", "corner", "opacity", "controls", "dashboard"],
  },
  {
    key: "hotCornerSize",
    label: "Corner size",
    ariaLabel: "Corner size in pixels",
    section: "controls",
    control: { kind: "range", min: 40, max: 96, step: 4, unit: "px" },
    defaultValue: 64,
    browserLayer: false,
    copyable: true,
    showWhen: { key: "showUI", equals: false },
    resetTest: "reset-hot-corner-size",
    keywords: ["corner size", "hot corner", "corner", "controls", "dashboard"],
  },
  {
    key: "hotCornerLongPressMs",
    label: "Hold for",
    ariaLabel: "Hold for, in milliseconds",
    section: "controls",
    control: { kind: "range", min: 200, max: 1200, step: 50, unit: "ms" },
    defaultValue: 500,
    browserLayer: false,
    copyable: true,
    showWhen: { key: "showUI", equals: false },
    resetTest: "reset-hot-corner-long-press",
    keywords: ["hold for", "hot corner", "corner", "long press", "controls", "dashboard"],
  },
  {
    // Look moved in from Dashboard › Appearance (settings-scope §7 item 6).
    // Theme and font are per screen; theming a screen never touches the
    // household config, and a plain browser editing another screen keeps its
    // own look.
    key: "selectedTheme",
    label: "Theme",
    section: "look",
    control: { kind: "theme" },
    defaultValue: null,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-theme",
    keywords: [
      "theme",
      "appearance",
      "look",
      "palette",
      "colour scheme",
      "color scheme",
      "selected theme",
      "dashboard",
    ],
  },
  {
    key: "themeMode",
    label: "Light or dark",
    section: "look",
    control: { kind: "select", options: THEME_MODE_OPTIONS },
    defaultValue: "auto",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-theme-mode",
    keywords: [
      "light or dark",
      "dark mode",
      "light mode",
      "theme",
      "appearance",
      "look",
      "auto",
      "schedule",
      "dashboard",
    ],
  },
  {
    key: "darkModeStart",
    label: "Dark from",
    section: "look",
    control: { kind: "time" },
    defaultValue: 18,
    parse: hourValue,
    browserLayer: false,
    copyable: true,
    showWhen: { key: "themeMode", equals: "time" },
    resetTest: "reset-dark-from",
    keywords: [
      "dark from",
      "dark hours",
      "dark mode",
      "schedule",
      "light or dark",
      "theme",
      "appearance",
      "look",
    ],
  },
  {
    key: "darkModeEnd",
    label: "Dark to",
    section: "look",
    control: { kind: "time" },
    defaultValue: 6,
    parse: hourValue,
    browserLayer: false,
    copyable: true,
    showWhen: { key: "themeMode", equals: "time" },
    resetTest: "reset-dark-to",
    keywords: [
      "dark to",
      "dark hours",
      "dark mode",
      "schedule",
      "light or dark",
      "theme",
      "appearance",
      "look",
    ],
  },
  {
    key: "typeTheme",
    label: "Font",
    section: "look",
    control: { kind: "select", options: TYPE_THEME_OPTIONS },
    defaultValue: "instrument",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-font",
    keywords: [
      "font",
      "typeface",
      "type theme",
      "appearance",
      "look",
      "instrument",
      "marquee",
      "station",
      "dashboard",
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
    key: "touchControlSize",
    label: "Dashboard size",
    section: "display",
    description: "Size of labels and touch buttons on the dashboard.",
    control: { kind: "select", options: DASHBOARD_SIZE_OPTIONS },
    defaultValue: "medium",
    browserLayer: false,
    copyable: true,
    resetTest: "reset-dashboard-size",
    keywords: [
      "dashboard size",
      "size",
      "touch controls",
      "buttons",
      "labels",
      "display",
      "dashboard",
      "appearance",
    ],
  },
  {
    key: "uiSize",
    label: "Settings text size",
    section: "display",
    description: "Only changes Settings. The dashboard has its own Dashboard size.",
    control: { kind: "segmented", options: UI_SIZE_OPTIONS },
    defaultValue: "default",
    // Settings text size keeps the plain-browser layer it had in Dashboard:
    // ThisBrowserSettings and useUiScale still read calvin-ui-size.
    browserLayer: true,
    copyable: true,
    resetTest: "reset-settings-size",
    keywords: [
      "settings text size",
      "text size",
      "ui size",
      "size",
      "display",
      "appearance",
      "dashboard",
    ],
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
    key: "brightnessRampEnabled",
    label: "Ramp brightness at sleep and wake",
    section: "brightness",
    perScreenOnly: true,
    description:
      "Dims before the screen turns off and brightens slowly after it wakes. Use it when the screen's power supply struggles as it wakes.",
    control: { kind: "toggle" },
    defaultValue: false,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-ramp",
    keywords: ["brightness", "dim", "ramp", "wake", "under-voltage", "brown out", "power supply"],
  },
  {
    key: "brightness",
    label: "Brightness",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "range", min: 0, max: 100 },
    defaultValue: 20,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness",
    keywords: ["brightness", "dim", "ramp", "wake", "menu"],
  },
  {
    key: "brightnessStep",
    label: "Ramp step size",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "number", min: 1, max: 5 },
    defaultValue: 2,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-step",
    keywords: ["brightness", "ramp", "step", "speed"],
  },
  {
    key: "brightnessStepSeconds",
    label: "Ramp step interval",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "number", min: 0.5, max: 10 },
    defaultValue: 1.5,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-step-seconds",
    keywords: ["brightness", "ramp", "step", "speed", "interval"],
  },
  {
    key: "sleepMode",
    label: "At sleep",
    section: "brightness",
    perScreenOnly: true,
    description:
      "Dim only keeps the screen running at backlight 0 instead of turning it off. The backlight never fully turns off and the page keeps running.",
    control: {
      kind: "segmented",
      options: [
        { value: "standby", label: "Standby" },
        { value: "dim", label: "Dim only" },
      ],
    },
    defaultValue: "standby",
    browserLayer: false,
    copyable: false,
    resetTest: "reset-sleep-mode",
    keywords: ["brightness", "dim", "sleep", "standby", "dim only", "power"],
  },
  {
    key: "brightnessLimit",
    label: "Brightness limit",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "number", min: 0, max: 100 },
    defaultValue: null,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-limit",
    keywords: ["brightness", "limit", "safe limit", "display check"],
  },
  {
    key: "brightnessConversion",
    label: "Menu match",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "readings" },
    defaultValue: [],
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-conversion",
    keywords: ["brightness", "menu match", "display check", "conversion"],
  },
  {
    key: "brightnessFloor",
    label: "Lowest brightness",
    section: "brightness",
    perScreenOnly: true,
    control: { kind: "number", min: 0, max: 100 },
    defaultValue: null,
    browserLayer: false,
    copyable: false,
    resetTest: "reset-brightness-floor",
    keywords: ["brightness", "lowest", "minimum", "floor", "display check"],
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
    key: "photoRotationInterval",
    label: "Show each photo for",
    section: "behaviour",
    description: "In photo regions and the photo frame.",
    ariaLabel: "Show each photo for",
    control: {
      kind: "select",
      options: PHOTO_SHOW_SECONDS.map(seconds => ({ value: seconds, label: idleLabel(seconds) })),
      keepCurrent: true,
      formatOption: idleLabel,
    },
    defaultValue: 30,
    parse: photoShowSeconds,
    browserLayer: false,
    copyable: true,
    resetTest: "reset-photo-show-time",
    keywords: [
      "show each photo for",
      "photo",
      "slideshow",
      "rotation",
      "interval",
      "seconds",
      "minutes",
      "next photo",
    ],
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

// The rows a screen's page shows, in the order they appear. The Changed here
// line lists overrides in this order only: a host-internal `_` key, the name,
// Screen now or any key without a row never appears (settings-scope §5).
const SCREEN_PAGE_ROW_ORDER = [
  "availableScreens",
  "defaultScreenId",
  "selectedTheme",
  "themeMode",
  "darkModeStart",
  "darkModeEnd",
  "typeTheme",
  "orientation",
  "orientationFlipped",
  "applyDisplayRotation",
  "touchControlSize",
  "uiSize",
  "effectsLevel",
  "focusLightMode",
  "focusLightDimOthers",
  "keyboardFeedbackEnabled",
  "keyboardFeedbackMode",
  "showUI",
  "clockBarShowInKiosk",
  "tapAnywhereReveal",
  "hotCornerPosition",
  "hotCornerOpacity",
  "hotCornerSize",
  "hotCornerLongPressMs",
  "displayScheduleEnabled",
  "displaySchedule",
  "displayTimeout",
  "brightnessRampEnabled",
  "brightness",
  "brightnessStep",
  "brightnessStepSeconds",
  "sleepMode",
  "brightnessLimit",
  "brightnessConversion",
  "brightnessFloor",
  "touchControls",
  "onScreenKeyboard",
  "photoFrameEnabled",
  "photoFrameTimeout",
  "photoFrameSourceIds",
  "photoRotationInterval",
  "loadingLight",
  "layoutMode",
];

// The id a row carries so the Changed here line can scroll to it and flash it.
export const rowAnchorId = key => `setting-${key}`;

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
  if (control.kind === "number" || control.kind === "range") {
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
  // A string is the usual "show while this setting is on". An object names the
  // value it takes, so a row can also show while a setting is off.
  const condition =
    typeof descriptor.showWhen === "string"
      ? { key: descriptor.showWhen, equals: true }
      : descriptor.showWhen;
  const shown = normalizeSettingValue(descriptorFor(condition.key), values?.[condition.key]);
  return condition.equals === undefined
    ? shown === true || Boolean(shown)
    : shown === condition.equals;
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

// The settings a screen page can point at: only overrides with a row on the
// page, in page order, with the row's label.
export const changedSettingRows = overrides => {
  const changed = new Set(changedSettingKeys(overrides));
  return SCREEN_PAGE_ROW_ORDER.filter(key => changed.has(key)).map(key => ({
    key,
    label: SCREEN_SETTING_LABELS[key] || key,
  }));
};

export const changedSettingCount = overrides => changedSettingRows(overrides).length;

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
// The display check's findings (limit, menu match) survive: they describe the
// hardware, not a preference (calvin-29ws).
const KEPT_ON_RESET = new Set([
  "displayName",
  "brightnessLimit",
  "brightnessConversion",
  "brightnessFloor",
]);

export const withoutAllOverrides = overrides => {
  const next = { ...(overrides || {}) };
  for (const key of Object.keys(next)) {
    if (!KEPT_ON_RESET.has(key)) delete next[key];
  }
  return next;
};
