// The screen on/off schedule model (docs/design/2026-11-01-screen-schedule.md).
//
// The stored shape stays the backend's seven-day array: `{ day, enabled, onTime,
// offTime }` with day 0 = Monday (Python's weekday(), not JS getDay()). The
// compact editor's three shapes are inferred from that data, so no new config
// key was added.

/** Day names in the backend's weekday order, and in the summary's copy. */
export const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Short labels for the Each day table. */
export const SCHEDULE_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SCHEDULE_MODES = [
  { value: "every-day", label: "Every day" },
  { value: "weekdays", label: "Weekdays and weekends" },
  { value: "each-day", label: "Each day" },
];

const DEFAULT_DAY = { enabled: true, onTime: "06:00", offTime: "22:00" };

const copy = day => ({ ...day });
const pad = value => String(value).padStart(2, "0");

/** Seven entries in weekday order, filling gaps with the default times. */
export function normalizeSchedule(value) {
  const entries = Array.isArray(value) ? value : [];
  return SCHEDULE_DAYS.map((_, day) => {
    const entry = entries.find(item => Number(item?.day) === day) || {};
    return {
      day,
      enabled: entry.enabled !== false,
      onTime: entry.onTime || DEFAULT_DAY.onTime,
      offTime: entry.offTime || DEFAULT_DAY.offTime,
    };
  });
}

const sameTimes = days =>
  days.length > 0 &&
  days.every(day => day.onTime === days[0].onTime && day.offTime === days[0].offTime);

const groupEnabled = days => days.every(day => day.enabled);

/**
 * every-day: all seven on with the same times.
 * weekdays: Mon–Fri equal, Sat–Sun equal, and the two groups are both on or
 * both off all day.
 * each-day: anything else.
 */
export function inferScheduleMode(value) {
  const schedule = normalizeSchedule(value);
  if (schedule.every(day => day.enabled) && sameTimes(schedule)) return "every-day";
  const weekdays = schedule.slice(0, 5);
  const weekend = schedule.slice(5);
  const bothOn = groupEnabled(weekdays) && groupEnabled(weekend);
  const bothOff = !weekdays.some(day => day.enabled) && !weekend.some(day => day.enabled);
  if (sameTimes(weekdays) && sameTimes(weekend) && (bothOn || bothOff)) return "weekdays";
  return "each-day";
}

/** Write an inferred mode back to the array (Every day copies day 0, weekdays copies Monday and Saturday). */
export function applyScheduleMode(value, mode) {
  const schedule = normalizeSchedule(value);
  if (mode === "every-day") {
    return schedule.map(day => ({ ...copy(schedule[0]), day: day.day }));
  }
  if (mode === "weekdays") {
    const monday = schedule[0];
    const saturday = schedule[5];
    return schedule.map((day, index) => ({
      ...copy(index < 5 ? monday : saturday),
      day: day.day,
    }));
  }
  return schedule;
}

/** "06:00", or "6:00 AM" in the 12-hour setting. */
export function formatScheduleTime(value, timeFormat = "24h") {
  const [rawHour, rawMinute] = String(value || "")
    .split(":")
    .map(Number);
  const hour = Number.isFinite(rawHour) ? Math.max(0, Math.min(23, rawHour)) : 0;
  const minute = Number.isFinite(rawMinute) ? Math.max(0, Math.min(59, rawMinute)) : 0;
  if (timeFormat !== "12h") return `${pad(hour)}:${pad(minute)}`;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 || 12;
  return `${twelve}:${pad(minute)} ${suffix}`;
}

const isOvernight = day => day.offTime <= day.onTime;

const range = (day, timeFormat) => {
  const on = formatScheduleTime(day.onTime, timeFormat);
  const off = formatScheduleTime(day.offTime, timeFormat);
  return `${on}–${off}${isOvernight(day) ? " the next day" : ""}`;
};

const offDayNames = days =>
  days.map(day => {
    const name = SCHEDULE_DAYS[day.day];
    return `${name}s`;
  });

/**
 * The single line under the Schedule row. It follows the same mode inference,
 * so what it says always matches the table the Change button opens.
 */
export function formatScheduleSummary(value, { timeFormat = "24h" } = {}) {
  const schedule = normalizeSchedule(value);
  const enabled = schedule.filter(day => day.enabled);
  if (enabled.length === 0) return "Off every day";

  const mode = inferScheduleMode(schedule);
  if (mode === "every-day") {
    const day = schedule[0];
    const copy = `On ${formatScheduleTime(day.onTime, timeFormat)} · off ${formatScheduleTime(
      day.offTime,
      timeFormat
    )}`;
    // "On 22:00 · off 06:00 the next day" already says the schedule repeats.
    return isOvernight(day) ? `${copy} the next day` : `${copy}, every day`;
  }

  if (mode === "weekdays") {
    const weekdays = schedule[0];
    const weekend = schedule[5];
    return `Weekdays ${range(weekdays, timeFormat)} · weekends ${range(weekend, timeFormat)}`;
  }

  const off = schedule.filter(day => !day.enabled);
  const offCopy = off.length ? ` · Off on ${joinNames(offDayNames(off))}` : "";
  return `Different each day${offCopy}`;
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The rows the table shows for a mode: one for every day, two groups, or the
 * seven days in the configured week order (`weekStartDay`: 0 = Sunday).
 */
export function scheduleRows(value, mode, weekStartDay = 1) {
  if (mode === "every-day") {
    return [
      { key: "every-day", label: "Every day", a11y: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
    ];
  }
  if (mode === "weekdays") {
    return [
      { key: "weekdays", label: "Mon–Fri", a11y: "Weekdays", days: [0, 1, 2, 3, 4] },
      { key: "weekend", label: "Sat–Sun", a11y: "Weekend", days: [5, 6] },
    ];
  }
  // weekStartDay is a JS weekday (0 = Sunday); the schedule uses 0 = Monday.
  const start = Number.isFinite(Number(weekStartDay)) ? Number(weekStartDay) : 1;
  const order = Array.from({ length: 7 }, (_, index) => {
    const jsDay = (start + index) % 7;
    return (jsDay + 6) % 7;
  });
  return order.map(day => ({
    key: `day-${day}`,
    label: SCHEDULE_DAY_LABELS[day],
    a11y: SCHEDULE_DAYS[day],
    days: [day],
  }));
}
