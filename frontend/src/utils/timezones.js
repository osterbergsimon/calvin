/**
 * Timezone choices for the screen on/off schedule (CLV-46).
 *
 * The engine knows the full IANA list through `Intl.supportedValuesOf("timeZone")`
 * — 400+ zones instead of the 11 Calvin used to hardcode. Older WebKit/WPE
 * builds (the cog kiosk) don't implement it, so those keep the old list and
 * still get to see whatever zone the server already has stored.
 */

// Stored value meaning "use the server's own zone" (kept for compatibility).
export const SERVER_TIMEZONE = "system";

/** The zones Calvin offered before the full list, also the no-API fallback. */
export const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Stockholm",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

/** "America/New_York" → "America/New York" (the "_" is IANA syntax, not a name). */
export const timezoneLabel = zone => String(zone).replace(/_/g, " ");

/** Every zone this engine can offer, best source first. */
export function availableTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length > 0) return zones;
    }
  } catch {
    // Older engines: no supportedValuesOf, or it throws for an unknown key.
  }
  return FALLBACK_TIMEZONES;
}

/**
 * Options for the picker: "Server's timezone" first, then the full list. A
 * stored zone the runtime list lacks stays visible (and selected) right below
 * the server option, so an existing setting never disappears.
 *
 * Labels are the zone id without its "_". A UTC-offset hint is deliberately
 * left out: the offset depends on the date (DST), so a static one would lie.
 */
export function buildTimezoneOptions(selected) {
  // This engine's IANA list leaves out plain "UTC" (it is CLDR's zone, not a
  // canonical area/city id), but Calvin has always offered it and it is a
  // valid Intl zone — keep it as the second choice.
  const zones = availableTimezones();
  const allZones = zones.includes("UTC") ? zones : ["UTC", ...zones];
  const options = [{ value: SERVER_TIMEZONE, label: "Server's timezone" }];
  const seen = new Set([SERVER_TIMEZONE]);

  const stored = selected && selected !== SERVER_TIMEZONE ? selected : null;
  if (stored && !allZones.includes(stored)) {
    options.push({ value: stored, label: timezoneLabel(stored) });
    seen.add(stored);
  }

  for (const zone of allZones) {
    if (seen.has(zone)) continue;
    options.push({ value: zone, label: timezoneLabel(zone) });
    seen.add(zone);
  }
  return options;
}
