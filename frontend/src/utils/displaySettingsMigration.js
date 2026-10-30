/**
 * One-time display-settings migration (CLV-49).
 *
 * Week numbers, events per day and photo fit used to be household settings.
 * They now live on each region, with no global default layer. On the first
 * config load after the change every calendar/photos region without its own
 * value inherits today's global value; the config flag then stops it running
 * again. The old keys stay stored (readable) but are never read afterwards.
 */

import { normalizeDashboardScreens } from "./layout";
import { normalizePhotoFit } from "./photoFit";

const clampDensity = value => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 4;
  return Math.min(20, Math.max(1, n));
};

const migrateRegion = (region, globals, state) => {
  let next = region;
  if (region.split?.regions) {
    const regions = region.split.regions.map(sub => migrateRegion(sub, globals, state));
    if (regions.some((sub, i) => sub !== region.split.regions[i])) {
      next = { ...next, split: { ...region.split, regions } };
      state.changed = true;
    }
    return next;
  }

  if (region.kind === "calendar") {
    const view = { ...(region.view || {}) };
    let changed = false;
    if (typeof view.weekNumbers !== "boolean") {
      view.weekNumbers = globals.showWeekNumbers;
      changed = true;
    }
    if (!Number.isFinite(Number(view.maxVisibleEvents))) {
      view.maxVisibleEvents = globals.maxVisibleEvents;
      changed = true;
    }
    if (!changed) return region;
    state.changed = true;
    return { ...region, view };
  }

  if (region.kind === "photos") {
    if (region.view?.fit) return region;
    state.changed = true;
    return { ...region, view: { ...(region.view || {}), fit: globals.imageDisplayMode } };
  }

  return region;
};

/**
 * @param {object} screensConfig dashboardScreens (or dashboard_screens) value
 * @param {{ showWeekNumbers?: boolean, maxVisibleEvents?: number, imageDisplayMode?: string }} globals
 * @returns {{ screens: object, changed: boolean }}
 */
export function migrateDisplaySettings(screensConfig, globals = {}) {
  const normalized = normalizeDashboardScreens(screensConfig);
  const state = { changed: false };
  const values = {
    showWeekNumbers: globals.showWeekNumbers === true,
    maxVisibleEvents: clampDensity(globals.maxVisibleEvents),
    imageDisplayMode: normalizePhotoFit(globals.imageDisplayMode),
  };
  const screens = normalized.screens.map(screen => {
    const regions = screen.layout.regions.map(region => migrateRegion(region, values, state));
    if (regions.every((region, i) => region === screen.layout.regions[i])) return screen;
    return { ...screen, layout: { ...screen.layout, regions } };
  });
  return {
    screens: state.changed ? { ...normalized, screens } : normalized,
    changed: state.changed,
  };
}
