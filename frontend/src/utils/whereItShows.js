/**
 * "Where it shows" (CLV-49 §5): the region view of Content.
 *
 * Content answers what Calvin shows and where; the region inspector answers how
 * one region looks. These helpers turn the pages config into one compact line
 * per region of a kind.
 */

import { getLeafRegions, normalizeDashboardScreens } from "./layout";
import { normalizePhotoFit } from "./photoFit";

const REGION_LABELS = { calendar: "Calendar", photos: "Photos", service: "Service" };
const PHOTO_FIT_LABELS = {
  smart: "Smart fit",
  fit: "Whole photo",
  fill: "Fill",
  center: "Centre",
};

const sourceNameLookup = sources =>
  new Map((sources || []).map(source => [source.id, source.name]));

/** A short, human summary of one region's look. */
export function describeRegionLook(region, sources = []) {
  const view = region?.view || {};
  if (region?.kind === "calendar") {
    const days = Number.isFinite(Number(view.days)) ? Number(view.days) : 7;
    if (view.mode === "week") return `Agenda, ${days} days`;
    if (view.mode === "day") return "Day";
    let summary = "Month";
    if (view.weekNumbers === true) summary += " · week numbers";
    const density = Number(view.maxVisibleEvents);
    summary += ` · ${Number.isFinite(density) ? `${density} event${density === 1 ? "" : "s"}` : "Auto events"}`;
    return summary;
  }
  if (region?.kind === "photos") {
    return PHOTO_FIT_LABELS[normalizePhotoFit(view.fit)];
  }
  if (region?.kind === "service") {
    const names = sourceNameLookup(sources);
    const sourceId = region.instanceIds?.[0] || region.serviceId;
    return names.get(sourceId) || "No source";
  }
  return "";
}

/**
 * One line per region of `kind`, across every page in config order.
 * @returns {Array<{ pageId, pageName, regionId, regionLabel, summary, sourceNames }>}
 */
export function whereItShows(config, kind, sources = []) {
  const names = sourceNameLookup(sources);
  const screens = normalizeDashboardScreens(config?.dashboardScreens).screens;
  const lines = [];
  for (const screen of screens) {
    for (const region of getLeafRegions(screen.layout)) {
      if (region.kind !== kind) continue;
      const ids = region.instanceIds || [];
      lines.push({
        pageId: screen.id,
        pageName: screen.name,
        regionId: region.id,
        regionLabel: REGION_LABELS[kind] || "Region",
        summary: describeRegionLook(region, sources),
        // Only worth saying when the region does not show every source. A
        // service region shows exactly the one source named in the summary.
        sourceNames: kind === "service" ? [] : ids.map(id => names.get(id)).filter(Boolean),
      });
    }
  }
  return lines;
}
