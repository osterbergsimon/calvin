// Single source of truth for the dashboard "Touch target size" scale. Drives all
// region chrome (labels, header controls, floating cluster). See
// docs/superpowers/specs/2026-07-06-dashboard-region-chrome-scale-design.md.
export const REGION_CHROME_SCALE = {
  // rail (control height) is kept close to the label's line box (~1.4x the label
  // font-size) so header buttons sit in proportion to the label instead of
  // towering over it. glyph tracks the rail.
  xsmall: {
    rail: "22px",
    label: "1.0rem",
    sublabel: "0.7rem",
    glyph: "0.8rem",
    content: "0.85rem",
  },
  small: {
    rail: "24px",
    label: "1.1rem",
    sublabel: "0.75rem",
    glyph: "0.85rem",
    content: "0.92rem",
  },
  medium: {
    rail: "28px",
    label: "1.25rem",
    sublabel: "0.85rem",
    glyph: "0.95rem",
    content: "1.0rem",
  },
  large: {
    rail: "34px",
    label: "1.5rem",
    sublabel: "0.95rem",
    glyph: "1.1rem",
    content: "1.12rem",
  },
  xlarge: {
    rail: "40px",
    label: "1.7rem",
    sublabel: "1.05rem",
    glyph: "1.25rem",
    content: "1.25rem",
  },
};

export const REGION_CHROME_SIZES = Object.keys(REGION_CHROME_SCALE);
export const DEFAULT_REGION_CHROME_SIZE = "medium";

// CSS custom properties for a size. --icon-size/--icon-font keep IconButton
// size="custom" working; --region-content-fs is reserved for phase 2 (renderer
// bodies) and set now so no rework is needed later.
export function regionChromeVars(size) {
  const t = REGION_CHROME_SCALE[size] ?? REGION_CHROME_SCALE[DEFAULT_REGION_CHROME_SIZE];
  return {
    "--region-rail-h": t.rail,
    "--region-label-fs": t.label,
    "--region-sublabel-fs": t.sublabel,
    "--region-glyph-fs": t.glyph,
    "--region-content-fs": t.content,
    "--icon-size": t.rail,
    "--icon-font": t.glyph,
  };
}
