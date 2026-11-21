// "Screen now": a manual on/off choice that overrides a screen's own schedule
// only until that schedule's next on/off boundary (calvin-ydzz).
//
// The UI stores `{ power, setAt }` in the kiosk's override layer. `setAt` is a
// UTC instant; the display agent owns the clock and ends the override at the
// first schedule boundary after it, computed with its own `now_in(cfg)` zone.
// Keeping the browser out of that decision means a phone and the Pi can never
// disagree about when the schedule takes over. The helpers here only estimate
// the boundary for the informational "Off until HH:MM" text, and mirror the
// agent's schedule decision so the row can say what the screen is doing now.

import { formatDataFrom } from "./connectionTime";

/** Where the home automation guide lives (UI spec §5). */
export const HOME_AUTOMATION_GUIDE_URL =
  "https://osterbergsimon.github.io/calvin/integrations/HOME_AUTOMATION/";

export const SCREEN_POWER_MODES = ["schedule", "always_on", "external"];

/** The three choices, in the order the control shows them (UI spec §2.1). */
export const SCREEN_POWER_OPTIONS = [
  { value: "schedule", label: "Schedule" },
  { value: "always_on", label: "Always on" },
  { value: "external", label: "External" },
];

/** The hint under the label, per choice (UI spec §2.1). */
export const SCREEN_POWER_HINTS = {
  schedule: "Turns on and off at the times below.",
  always_on: "Never turns off on a schedule. Turn off when idle still applies.",
  external: "Homey, Home Assistant or a script with an API key turns it on and off.",
};

const formatterCache = new Map();

/** The screen's configured zone, or null when it uses the system zone. */
export function effectiveTimeZone(config) {
  const zone = config?.timezone;
  return zone && zone !== "system" ? zone : null;
}

function partsFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock fields of `date` in `timeZone` (or the browser's zone). */
export function zonedParts(date, timeZone = null) {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      // Python's weekday() convention: 0 = Monday … 6 = Sunday.
      weekday: (date.getDay() + 6) % 7,
    };
  }
  const fields = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") fields[part.type] = part.value;
  }
  const result = {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    hour: Number(fields.hour) % 24,
    minute: Number(fields.minute),
    second: Number(fields.second),
  };
  result.weekday =
    (new Date(Date.UTC(result.year, result.month - 1, result.day)).getUTCDay() + 6) % 7;
  return result;
}

/** The instant whose wall clock in `timeZone` is the given local time. */
function zonedTimeToDate(year, month, day, hour, minute, timeZone = null) {
  if (!timeZone) return new Date(year, month - 1, day, hour, minute, 0, 0);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let instant = target;
  // Two passes settle the zone offset across a DST change.
  for (let pass = 0; pass < 2; pass += 1) {
    const local = zonedParts(new Date(instant), timeZone);
    const asUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    instant = target - (asUtc - instant);
  }
  return new Date(instant);
}

function parseClock(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, minutes: hour * 60 + minute };
}

/**
 * The first on/off boundary strictly after `moment`, or null when the schedule
 * is off or has no enabled entries. The agent uses the same rule and zone.
 */
export function firstScheduleBoundaryAfter({ enabled, schedule, moment, timeZone = null }) {
  if (!enabled || !Array.isArray(schedule)) return null;
  const start = zonedParts(moment, timeZone);
  let best = null;
  for (let offset = 0; offset <= 8; offset += 1) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const weekday = (date.getUTCDay() + 6) % 7;
    const entry = schedule.find(day => day && Number(day.day) === weekday && day.enabled);
    if (!entry) continue;
    for (const key of ["onTime", "offTime"]) {
      const clock = parseClock(entry[key]);
      if (!clock) continue;
      const candidate = zonedTimeToDate(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        clock.hour,
        clock.minute,
        timeZone
      );
      if (candidate.getTime() > moment.getTime() && (!best || candidate < best)) {
        best = candidate;
      }
    }
  }
  return best;
}

/** The next boundary after `now` (kept for the schedule row's tests). */
export function nextScheduleBoundary({ enabled, schedule, now = new Date(), timeZone = null }) {
  return firstScheduleBoundaryAfter({ enabled, schedule, moment: now, timeZone });
}

/** Whether the effective schedule wants the screen on at `now` (agent parity). */
export function scheduleDesiredOn({ enabled, schedule, now = new Date(), timeZone = null }) {
  if (!enabled || !Array.isArray(schedule)) return true;
  const today = zonedParts(now, timeZone);
  const entry = schedule.find(day => day && Number(day.day) === today.weekday && day.enabled);
  if (!entry) return true;
  const on = parseClock(entry.onTime ?? "06:00");
  const off = parseClock(entry.offTime ?? "22:00");
  if (!on || !off) return true;
  const minutes = today.hour * 60 + today.minute;
  return off.minutes < on.minutes
    ? minutes >= on.minutes || minutes < off.minutes
    : minutes >= on.minutes && minutes < off.minutes;
}

/** Whether any enabled day has a boundary the agent could act on. */
function hasScheduleBoundary({ enabled, schedule }) {
  if (!enabled || !Array.isArray(schedule)) return false;
  return schedule.some(
    day => day && day.enabled && (parseClock(day.onTime) || parseClock(day.offTime))
  );
}

// The screen's system zone can sit up to 14 hours away from the admin
// browser's. Its own boundary estimate is therefore only a rough lower bound:
// keep the override until that estimate plus this slack has passed, when it
// must be over on the screen too.
const UNKNOWN_ZONE_SLACK_MS = 14 * 60 * 60 * 1000;

/**
 * The active `{ power, setAt, expiry, hasSchedule }` override, or null when
 * absent, expired or invalid. `expiry` is null when no schedule can take over
 * (it stays until changed); `timeZone` only affects the display estimate.
 *
 * When the screen uses its system zone the browser cannot know that zone, so
 * its own estimate only ends the override after a zone's worth of slack; until
 * then the row says "until the next scheduled change" rather than a time.
 * `hasSchedule` says whether a schedule will end it eventually.
 */
export function activePowerOverride(
  override,
  { enabled, schedule, now = new Date(), timeZone = null } = {}
) {
  if (!override || typeof override !== "object") return null;
  const power = String(override.power || "").toLowerCase();
  if (power !== "on" && power !== "off") return null;
  const setAt = Date.parse(override.setAt);
  if (!Number.isFinite(setAt)) return null;
  const hasSchedule = hasScheduleBoundary({ enabled, schedule });
  if (!timeZone) {
    const estimate = firstScheduleBoundaryAfter({
      enabled,
      schedule,
      moment: new Date(setAt),
      timeZone: null,
    });
    if (estimate && now.getTime() >= estimate.getTime() + UNKNOWN_ZONE_SLACK_MS) return null;
    return { power, setAt: override.setAt, expiry: null, hasSchedule };
  }
  const expiry = firstScheduleBoundaryAfter({
    enabled,
    schedule,
    moment: new Date(setAt),
    timeZone,
  });
  if (expiry && now.getTime() >= expiry.getTime()) return null;
  return { power, setAt: override.setAt, expiry, hasSchedule };
}

/** "22:00" (or "10:00 PM") for a boundary, in the screen's timezone. */
export function formatUntil(until, timeZone = null, timeFormat = "24h") {
  const date = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(date.getTime())) return "";
  if (timeFormat === "12h") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
  const parts = zonedParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * The screen's power mode (calvin-25g9): its own `screenPower`, else the legacy
 * layer switch, else the household's mode, else the household's legacy switch.
 * Mirrors the server's `effective_mode_for`.
 */
export function effectiveScreenMode(overrides, config) {
  const layer = overrides || {};
  if (SCREEN_POWER_MODES.includes(layer.screenPower)) return layer.screenPower;
  if ("displayScheduleEnabled" in layer) {
    return layer.displayScheduleEnabled ? "schedule" : "always_on";
  }
  if (SCREEN_POWER_MODES.includes(config?.screenPower)) return config.screenPower;
  return config?.displayScheduleEnabled ? "schedule" : "always_on";
}

const dayKeyFormatterCache = new Map();
function dayKeyFormatter(timeZone) {
  let formatter = dayKeyFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayKeyFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function dayDifference(from, to, timeZone) {
  const fromKey = dayKeyFormatter(timeZone).format(from);
  const toKey = dayKeyFormatter(timeZone).format(to);
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * When a command was set, in the UI spec's words: "at 21:04" today,
 * "on Tue at 21:04" in the last 6 days, "on 12 Oct" older (UI spec §3.3).
 * The clock text itself comes from formatDataFrom, so there is one date format.
 */
export function formatWhen(setAt, { timeFormat = "24h", timezone = null, now = new Date() } = {}) {
  if (!setAt) return "";
  const date = setAt instanceof Date ? setAt : new Date(setAt);
  if (Number.isNaN(date.getTime())) return "";
  const text = formatDataFrom(date, { timeFormat, timezone, now });
  if (!text) return "";
  const days = dayDifference(date, now, timezone);
  if (days <= 0) return `at ${text}`;
  if (days <= 6) {
    const split = text.indexOf(" ");
    if (split > 0) return `on ${text.slice(0, split)} at ${text.slice(split + 1)}`;
  }
  return `on ${text}`;
}

const KEY_NAME_LIMIT = 40;

/** The API key's name, cut to 40 characters with an ellipsis (UI spec §3.3). */
export function keyNameLabel(keyName) {
  const name = String(keyName ?? "").trim();
  if (!name) return "home automation";
  return name.length > KEY_NAME_LIMIT ? `${name.slice(0, KEY_NAME_LIMIT - 1)}…` : name;
}

/** The object to save for a manual choice: the choice plus the UTC instant. */
export function buildPowerOverride({ power, now = new Date() }) {
  return { power, setAt: now.toISOString() };
}
