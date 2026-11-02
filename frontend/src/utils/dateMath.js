/**
 * Month arithmetic for calendar navigation.
 *
 * `Date.prototype.setMonth` rolls invalid dates forward: Oct 31 with the month
 * bumped becomes "Nov 31", i.e. Dec 1, and a "next month" press silently skips
 * November. Month navigation must instead clamp the day to the last valid day
 * of the target month (Oct 31 -> Nov 30, Mar 31 -> Feb 28/29).
 */

/** Number of days in the given 0-based month (`month` may be out of range). */
export function daysInMonth(year, month) {
  // Day 0 of the next month is the last day of this one, and normalizes
  // out-of-range months/years for free.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Return a new Date moved by `months`, preserving the time of day.
 *
 * The day of month is kept when it exists in the target month, otherwise it is
 * clamped to the target month's last day. The input date is not mutated.
 *
 * @param {Date} date
 * @param {number} months e.g. 1 for next month, -1 for previous
 * @returns {Date}
 */
export function addMonths(date, months) {
  const target = new Date(date);
  const day = target.getDate();
  // Land on day 1 first so setMonth cannot roll over a short month...
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  // ...then restore the intended day, clamped to what the month actually has.
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}
