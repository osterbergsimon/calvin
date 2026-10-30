/**
 * Where a service source is placed (§3.6 of 2026-10-30-content-and-plugins.md).
 *
 * Calendars and photos are feeds: every source merges into any matching region.
 * A service source is *placed* — it only shows once a region's content names it
 * (`service:{id}`). Content therefore has to say where each one lives, and the
 * page editor needs a way to put one there.
 */

import {
  getLeafRegions,
  getPathById,
  normalizeDashboardScreens,
  setRegionContentAtPath,
} from "./layout";

const regionShowsService = (region, serviceId) =>
  region?.kind === "service" &&
  (region.serviceId === serviceId || (region.instanceIds || []).includes(serviceId));

/** Pages (screens) whose regions already show this service source. */
export const pagesUsingService = (config, serviceId) => {
  if (!serviceId) return [];
  const screens = normalizeDashboardScreens(config?.dashboardScreens);
  return screens.screens
    .filter(screen =>
      getLeafRegions(screen.layout).some(region => regionShowsService(region, serviceId))
    )
    .map(screen => ({ id: screen.id, name: screen.name }));
};

/** Human labels for the page names in a placement line. */
export const pageNamesLabel = pages => (pages || []).map(page => page.name).join(", ");

/**
 * Put a service source in a leaf region, returning a screens config ready to be
 * saved through `update:config`. When the region id is unknown the input is
 * returned unchanged so a stale tap can never move content somewhere else.
 */
export const placeServiceInRegion = (screensConfig, serviceId, regionId) => {
  const screens = normalizeDashboardScreens(screensConfig);
  let changed = false;
  const nextScreens = screens.screens.map(screen => {
    const path = getPathById(screen.layout, regionId);
    if (!path) return screen;
    changed = true;
    return {
      ...screen,
      layout: setRegionContentAtPath(screen.layout, path, {
        kind: "service",
        serviceId,
        instanceIds: [serviceId],
      }),
    };
  });
  return changed ? { ...screens, screens: nextScreens } : screens;
};

/** The leaf region a tap in place mode would fill. */
export const findPlaceableRegion = (config, regionId) => {
  const screens = normalizeDashboardScreens(config?.dashboardScreens);
  for (const screen of screens.screens) {
    const path = getPathById(screen.layout, regionId);
    if (path) {
      const leaf = getLeafRegions(screen.layout).find(region => region.id === regionId);
      if (leaf) return { screen, path, region: leaf };
    }
  }
  return null;
};

/**
 * Put a calendar or photos region on a page (CLV-49 §5 "Put it on a page").
 * All sources of that kind show, so the region carries no instance filter.
 */
export const placeKindInRegion = (screensConfig, kind, regionId) => {
  if (kind !== "calendar" && kind !== "photos") {
    return normalizeDashboardScreens(screensConfig);
  }
  const screens = normalizeDashboardScreens(screensConfig);
  let changed = false;
  const nextScreens = screens.screens.map(screen => {
    const path = getPathById(screen.layout, regionId);
    if (!path) return screen;
    changed = true;
    return {
      ...screen,
      layout: setRegionContentAtPath(screen.layout, path, { kind, instanceIds: [] }),
    };
  });
  return changed ? { ...screens, screens: nextScreens } : screens;
};
