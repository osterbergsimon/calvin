// Brightness ramp helpers (calvin-29ws, docs/design/2026-11-04-brightness-ramp-ui.md).
//
// Storage is the Calvin/DDC scale (0-100). A conversion from the owner's menu
// readings turns it into the numbers on the screen's own menu for display.

const DEFAULT_STEP = 2;
const DEFAULT_START = 20;
const OUTLIER_MENU_UNITS = 5;

const validPoints = readings =>
  (Array.isArray(readings) ? readings : []).filter(
    point => Number.isFinite(Number(point?.ddc)) && Number.isFinite(Number(point?.menu))
  );

/** Least-squares line through the readings, or null with fewer than two values. */
export function fitConversion(readings) {
  const points = validPoints(readings).map(p => ({ x: Number(p.ddc), y: Number(p.menu) }));
  if (new Set(points.map(p => p.x)).size < 2) return null;
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

export function ddcToMenu(ddc, readings) {
  const fit = fitConversion(readings);
  if (!fit) return null;
  return Math.round(fit.intercept + fit.slope * Number(ddc));
}

export function menuToDdc(menu, readings) {
  const fit = fitConversion(readings);
  if (!fit || fit.slope === 0) return null;
  return Math.round((Number(menu) - fit.intercept) / fit.slope);
}

const oneDecimal = value => String(Math.round(value * 10) / 10);

/** "menu ≈ 16 + 2.3 × Calvin value", or "" until there are two readings. */
export function fitSentence(readings) {
  const fit = fitConversion(readings);
  if (!fit) return "";
  return `menu ≈ ${Math.round(fit.intercept)} + ${oneDecimal(fit.slope)} × Calvin value`;
}

/** The last of three or more readings sits far off the line through the others. */
export function readingsOutlier(readings) {
  const points = validPoints(readings);
  if (points.length < 3) return false;
  const last = points[points.length - 1];
  const predicted = ddcToMenu(last.ddc, points.slice(0, -1));
  if (predicted === null) return false;
  return Math.abs(predicted - Number(last.menu)) > OUTLIER_MENU_UNITS;
}

/** The highest Calvin value the slider can reach: the limit minus two steps. */
export function maxPickable(limit, step = DEFAULT_STEP) {
  if (limit === null || limit === undefined) return 100;
  return Math.max(0, Number(limit) - 2 * (Number(step) || DEFAULT_STEP));
}

/** Where the brightness starts the first time the ramp is turned on. */
export function firstBrightness(limit, step = DEFAULT_STEP) {
  return Math.min(DEFAULT_START, maxPickable(limit, step));
}

/**
 * The overrides with a stored brightness lowered to the limit minus two steps
 * when it sits above it. Returns the same object when nothing changes, so a
 * caller can tell whether a write is needed.
 */
export function clampBrightness(overrides) {
  const limit = overrides?.brightnessLimit;
  const level = overrides?.brightness;
  if (limit === null || limit === undefined || level === null || level === undefined) {
    return overrides;
  }
  const cap = maxPickable(limit, overrides.brightnessStep ?? DEFAULT_STEP);
  return Number(level) > cap ? { ...overrides, brightness: cap } : overrides;
}

/**
 * The next Calvin value to ask the owner to read off the menu: 5 first, the
 * middle of the known-safe range, then near its top. Without a limit the range
 * stays at 20 or below. Null when all three have been read.
 */
export function nextReadingPoint(readings, limit, step = DEFAULT_STEP) {
  const cap = limit === null || limit === undefined ? DEFAULT_START : maxPickable(limit, step);
  const done = new Set(validPoints(readings).map(p => Number(p.ddc)));
  const candidates = [Math.min(5, cap), Math.round(cap / 2), cap];
  return candidates.find(value => !done.has(value)) ?? null;
}

/** Whole seconds the agent needs to step from `level` down to 0. */
export function dimSeconds(level, step = DEFAULT_STEP, stepSeconds = 1.5) {
  const steps = Math.ceil(Math.max(0, Number(level) || 0) / (Number(step) || DEFAULT_STEP));
  return Math.round(steps * (Number(stepSeconds) || 1.5));
}

export const checkedDate = iso => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const STACK_LABEL = { x11: "X11", wayland: "Wayland" };

/**
 * Whether the ramp can be used on this screen, with the row text and the one
 * action that fixes it. `findings` is the kiosk's persisted display check
 * (null = never got a detect report = not checked yet).
 */
export function availability(kiosk, findings, screenName = "This screen") {
  const stack = kiosk?.displayStack;
  if (stack && stack !== "cog") {
    return {
      state: "not-cog",
      disabled: true,
      action: null,
      text: `Needs the Calvin kiosk display (cog). ${screenName} uses ${STACK_LABEL[stack] || stack}.`,
    };
  }
  if (!findings || findings.ddc === undefined || findings.ddc === null) {
    return {
      state: "never",
      disabled: false,
      action: "check",
      text: "Calvin checks the display first. It takes about 10 s.",
    };
  }
  const when = checkedDate(findings.checkedAt);
  const checked = when ? ` Checked ${when}.` : "";
  if (findings.ddc === false) {
    return {
      state: "no-ddc",
      disabled: true,
      action: "check",
      text: `Not available: this screen doesn't answer brightness commands (DDC/CI).${checked}`,
      hint: "Check the adapter or cable, or turn DDC/CI on in the screen's own menu.",
    };
  }
  if (findings.writes === false) {
    return {
      state: "no-writes",
      disabled: true,
      action: "check",
      text: `Not available: brightness commands reach the screen but don't change it.${checked}`,
    };
  }
  return { state: "ok", disabled: false, action: null, text: "" };
}

/** One line for the Display check row. */
export function checkSummary(findings, readings, limit) {
  if (!findings || findings.ddc === undefined || findings.ddc === null) return "Not checked yet";
  const parts = [];
  parts.push(findings.ddc ? "Answers brightness commands" : "Doesn't answer brightness commands");
  if (findings.ddc && findings.writes === true) parts.push("changes take effect");
  if (findings.ddc && findings.writes === false) parts.push("changes don't take effect");
  const count = validPoints(readings).length;
  if (count >= 2) parts.push(`menu match from ${count} readings`);
  if (limit !== null && limit !== undefined) {
    const when = checkedDate(findings.checkedAt);
    parts.push(`limit ${limit}${when ? ` (${when})` : ""}`);
  }
  return parts.join(" · ");
}
