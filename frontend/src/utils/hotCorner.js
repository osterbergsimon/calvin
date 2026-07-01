// Geometry + config helpers for the hide-UI reveal hot corner. The corner is a
// fixed-position square hugging one screen corner; the reveal gesture is a
// long-press whose hit-box we compute here so the visual can stay
// pointer-events:none (never intercepting content taps). See calvin-arv.

export const HOT_CORNER_POSITIONS = ["bottom-left", "bottom-right", "top-left", "top-right"];

export const HOT_CORNER_DEFAULTS = {
  position: "bottom-left",
  opacity: 55, // 0–100, rest opacity of the visual hint (0 = invisible, still armed)
  size: 64, // px square touch target / long-press hit-box
  longPressMs: 500, // hold duration to trigger the reveal
};

// Legacy 'off' (removed) and any junk value fall back to a real corner so the
// reveal affordance always exists — dropping 'off' removes the lockout footgun.
export function normalizeHotCornerPosition(position) {
  return HOT_CORNER_POSITIONS.includes(position) ? position : HOT_CORNER_DEFAULTS.position;
}

// True when (x, y) in viewport coordinates falls inside the corner's square
// hit-box. Used by the dashboard-level long-press detector.
export function pointInHotCorner({ x, y, position, size, viewportWidth, viewportHeight }) {
  const s = Number(size) > 0 ? Number(size) : HOT_CORNER_DEFAULTS.size;
  const corner = normalizeHotCornerPosition(position);
  const left = corner.endsWith("-left");
  const top = corner.startsWith("top-");
  const inX = left ? x <= s : x >= viewportWidth - s;
  const inY = top ? y <= s : y >= viewportHeight - s;
  return inX && inY;
}
