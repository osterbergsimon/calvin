/**
 * Effects level (calvin-uudb): how expensive the focus light, dimming and
 * other dashboard effects are drawn.
 *
 * The household value is "auto" | "full" | "standard". "Auto" resolves per
 * screen: until a kiosk model report exists, every set-up kiosk gets
 * "standard" and a plain browser gets "full" (a phone or desktop is fast, and
 * reports prefers-reduced-motion itself).
 *
 * The resolved value goes on <html> as data-effects, so CSS can gate the
 * costly rules: `[data-effects="full"] .focus-panel.is-focused`.
 */
export const EFFECTS_LEVELS = ["auto", "full", "standard"];

/** The values that can actually be drawn; Auto resolves to one of these. */
export const RESOLVED_EFFECTS_LEVELS = ["full", "standard"];

export const EFFECTS_LEVEL_ATTRIBUTE = "data-effects";

export const EFFECTS_LEVEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "full", label: "Full" },
  { value: "standard", label: "Standard" },
];

/** "performance" was the pre-rename name for Standard; nothing shipped with it. */
const ALIASES = { performance: "standard" };

/**
 * A stored value as one of EFFECTS_LEVELS. Unknown values fall back to Auto,
 * and the old "performance" value reads as Standard so an early override or a
 * hand-edited config still works.
 */
export const normalizeEffectsLevel = value => {
  if (typeof value !== "string") return "auto";
  const next = value.trim().toLowerCase();
  if (ALIASES[next]) return ALIASES[next];
  return EFFECTS_LEVELS.includes(next) ? next : "auto";
};

/**
 * The level to draw: an explicit choice wins, Auto becomes Standard on a
 * set-up kiosk and Full in a plain browser.
 */
export const resolveEffectsLevel = ({ level, kiosk = false } = {}) => {
  const normalized = normalizeEffectsLevel(level);
  if (normalized !== "auto") return normalized;
  return kiosk ? "standard" : "full";
};

/** "Auto", "Full" or "Standard", for the row's copy. */
export const effectsLevelLabel = level => {
  const normalized = normalizeEffectsLevel(level);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

/** Put the resolved level on <html>; a missing DOM (SSR/tests) is a no-op. */
export const applyEffectsLevel = (
  level,
  root = typeof document === "undefined" ? null : document.documentElement
) => {
  if (!root) return level;
  root.setAttribute(EFFECTS_LEVEL_ATTRIBUTE, level);
  return level;
};
