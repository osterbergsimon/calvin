/**
 * Schema-driven formatters.
 *
 * Plugins reference these by name in their display_schema (e.g. `title_format: "weekday-short"`)
 * to format data without shipping JS. Centralized so the surface area is auditable.
 */

const formatters = {
  "weekday-short": value => formatDate(value, { weekday: "short", month: "short", day: "numeric" }),
  "weekday-long": value => formatDate(value, { weekday: "long", month: "long", day: "numeric" }),
  date: value => formatDate(value, { year: "numeric", month: "short", day: "numeric" }),
  "time-12h": value => formatDate(value, { hour: "numeric", minute: "2-digit", hour12: true }),
  "time-24h": value => formatDate(value, { hour: "2-digit", minute: "2-digit", hour12: false }),
  percent: value => (typeof value === "number" ? `${Math.round(value * 100)}%` : ""),
  "percent-raw": value => (typeof value === "number" ? `${Math.round(value)}%` : ""),
  bytes: value => formatBytes(value),
  "round-1": value => (typeof value === "number" ? value.toFixed(1) : ""),
  capitalize: value =>
    typeof value === "string" && value.length > 0
      ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
      : "",
};

function formatDate(value, options) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, options);
}

function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function applyFormat(value, formatName) {
  if (!formatName) return value;
  const fn = formatters[formatName];
  if (!fn) return value;
  return fn(value);
}

export function listFormatters() {
  return Object.keys(formatters);
}
