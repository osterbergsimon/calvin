// Single source of truth for the global UI-size presets.
//
// The user picks a discrete preset (stored as the string key `uiSize` in
// config); this module maps that key to the numeric --ui-scale factor applied
// on <html>. Storing the key (not the factor) means we can re-tune factors
// here without migrating any persisted config.
//
// See docs/design/2026-07-04-ui-sizing-tokens.md for the token vocabulary.

export const UI_SIZE_PRESETS = {
  compact: 0.85,
  default: 1.0,
  large: 1.15,
  "extra-large": 1.3,
};

export const DEFAULT_UI_SIZE = "default";

// Ordered for UI rendering (SegmentedControl option order).
export const UI_SIZE_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "extra-large", label: "Extra" },
];

export const isUiSize = id =>
  Object.prototype.hasOwnProperty.call(UI_SIZE_PRESETS, id);

// Resolve a preset key to its scale factor, falling back to Default (1.0) for
// unknown / missing keys so a bad stored value never breaks rendering.
export const uiScaleFor = id => UI_SIZE_PRESETS[isUiSize(id) ? id : DEFAULT_UI_SIZE];
