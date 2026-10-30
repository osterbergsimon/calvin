/**
 * Formatting for the connection pill's "data from {time}" stamp (CLV-48).
 *
 * - today            → HH:MM (12h/24h per the Time format setting)
 * - earlier this week → Tue 14:02
 * - older             → 12 Oct
 *
 * The stamp describes the last successful backend check, so it is shown in the
 * screen's own time zone (and therefore matches the clock bar's time).
 */

const WEEKDAY = { weekday: "short" };
const MONTH_DAY = { day: "numeric", month: "short" };
/** Older than this many days drops the weekday for a day + month stamp. */
const WEEKDAY_LIMIT_DAYS = 6;

const dayKeyFormatter = timezone =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const dayKey = (date, timezone) => dayKeyFormatter(timezone).format(date);

const dayDifference = (from, to, timezone) => {
  const fromKey = dayKey(from, timezone);
  const toKey = dayKey(to, timezone);
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86400000);
};

const formatTime = (date, { timeFormat, timezone }) => {
  const hour12 = timeFormat === "12h";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined,
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  }).format(date);
};

/**
 * @param {Date|string|number|null} date - last successful backend check
 * @param {{timeFormat?: '12h'|'24h', timezone?: string|null, now?: Date}} [options]
 * @returns {string} empty string when there is nothing to show
 */
export function formatDataFrom(
  date,
  { timeFormat = "24h", timezone = null, now = new Date() } = {}
) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";

  const days = dayDifference(value, now, timezone);

  if (days <= 0) {
    return formatTime(value, { timeFormat, timezone });
  }

  const time = formatTime(value, { timeFormat, timezone });

  if (days <= WEEKDAY_LIMIT_DAYS) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      ...WEEKDAY,
      timeZone: timezone || undefined,
    }).format(value);
    return `${weekday} ${time}`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    ...MONTH_DAY,
    timeZone: timezone || undefined,
  }).format(value);
}
