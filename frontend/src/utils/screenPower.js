// "Screen now": a manual on/off choice that overrides a screen's own schedule
// only until that schedule's next on/off boundary (calvin-ydzz).
//
// The Save writes the object to the kiosk's override layer as
// `{ power: "on"|"off", until: <ISO boundary>|null }`. The display agent then
// honours it while `until` is in the future (or null) and follows the schedule
// again once it expires. The helpers here mirror the agent's decisions so the
// row can say what the screen is doing now and when the schedule takes over.

const formatterCache = new Map();

/** "system" is the stored spelling of "the server's own zone". */
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
 * The next on/off boundary of a schedule after `now`, or null when the schedule
 * is off or has no enabled entries. Computed in the screen's timezone.
 */
export function nextScheduleBoundary({ enabled, schedule, now = new Date(), timeZone = null }) {
  if (!enabled || !Array.isArray(schedule)) return null;
  const today = zonedParts(now, timeZone);
  let best = null;
  for (let offset = 0; offset <= 8; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
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
      if (candidate.getTime() > now.getTime() && (!best || candidate < best)) best = candidate;
    }
  }
  return best;
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

/** The active `{ power, until }` override, or null when absent/expired/invalid. */
export function activePowerOverride(override, now = new Date()) {
  if (!override || typeof override !== "object") return null;
  const power = String(override.power || "").toLowerCase();
  if (power !== "on" && power !== "off") return null;
  const until = override.until ?? null;
  if (!until) return { power, until: null };
  const expiry = Date.parse(until);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return null;
  return { power, until };
}

/** "22:00" for a boundary, in the screen's timezone. */
export function formatUntil(until, timeZone = null) {
  const date = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * The override object to save for a manual choice: `until` is the schedule's
 * next on/off boundary, or null when no schedule can take over.
 */
export function buildPowerOverride({
  power,
  enabled,
  schedule,
  now = new Date(),
  timeZone = null,
}) {
  const boundary = nextScheduleBoundary({ enabled, schedule, now, timeZone });
  return { power, until: boundary ? boundary.toISOString() : null };
}
