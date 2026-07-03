// UI-only presentation metadata for the frozen keyboard action vocabulary
// (see composables/useKeyboardActions.js). Grouping/labels live here; the
// action VALUES must stay in lockstep with the frozen handler.

export const ACTION_GROUPS = [
  {
    id: "generic",
    label: "Generic · context-aware",
    tier: "recommended",
    actions: [
      { value: "generic_next", label: "Next", description: "adapts to the focused region" },
      { value: "generic_prev", label: "Previous", description: "adapts to the focused region" },
      {
        value: "generic_expand_close",
        label: "Expand / Close",
        description: "expand event · enter/exit fullscreen",
      },
      { value: "generic_refresh", label: "Refresh", description: "refresh the focused region" },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    tier: "primary",
    actions: [
      { value: "screen_next", label: "Screen Next" },
      { value: "screen_prev", label: "Screen Previous" },
      { value: "region_next", label: "Region Next" },
      { value: "region_prev", label: "Region Previous" },
      { value: "screen_1", label: "Screen 1" },
      { value: "screen_2", label: "Screen 2" },
      { value: "screen_3", label: "Screen 3" },
      { value: "screen_4", label: "Screen 4" },
      { value: "screen_5", label: "Screen 5" },
      { value: "screen_6", label: "Screen 6" },
      { value: "screen_7", label: "Screen 7" },
      { value: "mode_settings", label: "Open Settings" },
    ],
  },
  {
    id: "jump",
    label: "Jump to a screen",
    tier: "collapsed",
    actions: [
      {
        value: "mode_calendar",
        label: "Calendar screen",
        description: "first screen with a calendar region",
      },
      { value: "mode_photos", label: "Photos screen" },
      { value: "mode_web_services", label: "Services screen" },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    tier: "collapsed",
    actions: [
      { value: "calendar_next", label: "Calendar: Next" },
      { value: "calendar_prev", label: "Calendar: Previous" },
      { value: "calendar_expand", label: "Calendar: Expand" },
      { value: "calendar_collapse", label: "Calendar: Collapse" },
      { value: "calendar_refresh", label: "Calendar: Refresh" },
      { value: "calendar_enter_fullscreen", label: "Calendar: Enter Fullscreen" },
      { value: "calendar_exit_fullscreen", label: "Calendar: Exit Fullscreen" },
    ],
  },
  {
    id: "photos",
    label: "Photos",
    tier: "collapsed",
    actions: [
      { value: "images_next", label: "Photos: Next" },
      { value: "images_prev", label: "Photos: Previous" },
      { value: "photos_enter_fullscreen", label: "Photos: Enter Fullscreen" },
      { value: "photos_exit_fullscreen", label: "Photos: Exit Fullscreen" },
    ],
  },
  {
    id: "services",
    label: "Web Services",
    tier: "collapsed",
    actions: [
      { value: "web_service_next", label: "Service: Next" },
      { value: "web_service_prev", label: "Service: Previous" },
      { value: "web_service_close", label: "Service: Close" },
      { value: "web_service_1", label: "Web Service 1" },
      { value: "web_service_2", label: "Web Service 2" },
      { value: "service_refresh", label: "Service: Refresh" },
    ],
  },
  {
    id: "legacy",
    label: "Legacy / advanced",
    tier: "collapsed",
    actions: [
      { value: "mode_cycle", label: "Cycle modes (legacy)" },
      { value: "mode_spare", label: "Spare (no action)" },
      { value: "calendar_next_month", label: "Calendar: Next Month (legacy)" },
      { value: "calendar_prev_month", label: "Calendar: Previous Month (legacy)" },
      { value: "calendar_expand_today", label: "Calendar: Expand Today (legacy)" },
      { value: "none", label: "No Action" },
    ],
  },
];

export const ALL_ACTION_VALUES = ACTION_GROUPS.flatMap(g => g.actions.map(a => a.value));

const LABELS = Object.fromEntries(
  ACTION_GROUPS.flatMap(g => g.actions.map(a => [a.value, a.label]))
);

export function actionLabel(value) {
  return LABELS[value] || value;
}
