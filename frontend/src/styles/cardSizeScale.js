// Per-region card footprint scale. Deliberately shares the five keys of the
// global "Dashboard size" setting (regionChromeScale.js) so the two controls
// align. `medium` equals today's card-grid default (auto-fit-220 / 1rem pad),
// making it a no-op — exactly how Dashboard-size `medium` leaves chrome as-is.
// Unlike Dashboard size (text), this scales card FOOTPRINT: column min-width +
// internal padding. The two are orthogonal.
export const CARD_SIZE_SCALE = {
  xsmall: { min: "160px", pad: "0.6rem" },
  small: { min: "190px", pad: "0.8rem" },
  medium: { min: "220px", pad: "1rem" },
  large: { min: "260px", pad: "1.2rem" },
  xlarge: { min: "300px", pad: "1.4rem" },
};

export const CARD_SIZE_KEYS = Object.keys(CARD_SIZE_SCALE);
export const DEFAULT_CARD_SIZE = "medium";

// CSS custom properties consumed by CardGrid: --card-min drives the auto-fit
// column min-width, --card-pad the card padding. Unknown -> medium.
export function cardSizeVars(size) {
  const t = CARD_SIZE_SCALE[size] ?? CARD_SIZE_SCALE[DEFAULT_CARD_SIZE];
  return { "--card-min": t.min, "--card-pad": t.pad };
}
