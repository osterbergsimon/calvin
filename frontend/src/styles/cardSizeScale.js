// Per-region card footprint scale. Deliberately shares the five keys of the
// global "Dashboard size" setting (regionChromeScale.js) so the two controls
// align. `medium` equals today's card-grid default (auto-fit-220 / 1rem pad),
// making it a no-op — exactly how Dashboard-size `medium` leaves chrome as-is.
// Card size scales the card FOOTPRINT (column min-width + padding) and its text
// (relative to the Dashboard-size base, so the two compose). The column width
// only moves when the column count does, so text size is what keeps every step
// visible in a region wider than its cards.
export const CARD_SIZE_SCALE = {
  xsmall: { min: "160px", pad: "0.6rem", fs: "0.8em" },
  small: { min: "190px", pad: "0.8rem", fs: "0.9em" },
  medium: { min: "220px", pad: "1rem", fs: "1em" },
  large: { min: "260px", pad: "1.2rem", fs: "1.12em" },
  xlarge: { min: "300px", pad: "1.4rem", fs: "1.25em" },
};

export const CARD_SIZE_KEYS = Object.keys(CARD_SIZE_SCALE);
export const DEFAULT_CARD_SIZE = "medium";

// CSS custom properties consumed by CardGrid: --card-min drives the auto-fit
// column min-width, --card-pad the card padding, --card-fs the card text size. Unknown -> medium.
export function cardSizeVars(size) {
  const t = CARD_SIZE_SCALE[size] ?? CARD_SIZE_SCALE[DEFAULT_CARD_SIZE];
  return { "--card-min": t.min, "--card-pad": t.pad, "--card-fs": t.fs };
}
