/**
 * Which pages a kiosk actually shows.
 *
 * Mirrors the backend (merge_overrides in app/services/kiosk_registry.py): a
 * kiosk's own availableScreens override replaces the Default config's list
 * wholesale. Without an override the Default list applies, and a null or
 * missing list means every page. An explicit empty list means no pages.
 */
export function effectiveAvailablePages(kioskOverrides, config, pages = []) {
  const allIds = (pages || [])
    .map(page => (typeof page === "string" ? page : page?.id))
    .filter(Boolean);
  const overrides = kioskOverrides || {};
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, "availableScreens");
  const list = hasOverride
    ? overrides.availableScreens
    : (config?.availableScreens ?? config?.available_screens);
  return Array.isArray(list) ? [...list] : allIds;
}
