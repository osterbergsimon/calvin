/**
 * Plans for keeping the shared page catalog and each target's page list in
 * step (docs/design/2026-11-02-shared-pages.md).
 *
 * A target is either Default (browsers and new screens) or one kiosk. Its page
 * list is the kiosk override when present, otherwise Default's list, otherwise
 * all pages. These helpers are pure: the component saves the catalog first and
 * then applies the returned list patches.
 */

import { effectiveAvailablePages } from "./availablePages";

const pageIds = pages =>
  (pages || []).map(page => (typeof page === "string" ? page : page?.id)).filter(Boolean);

const sameSet = (a, b) => a.length === b.length && b.every(id => a.includes(id));

/**
 * Where a newly added (or duplicated) page goes.
 *
 * From a screen: Default's null (all) list is pinned to the pages that existed
 * before, and that screen gets an override with its current effective list plus
 * the new page. From Default: a null list stays null; a restricted list gains
 * the page.
 */
export function addPagePlan({ scopeId, defaultList, pages, screenOverrides, pageId }) {
  const beforeIds = pageIds(pages);
  if (scopeId == null) {
    return {
      defaultList: Array.isArray(defaultList) ? [...defaultList, pageId] : null,
      screenList: null,
    };
  }
  return {
    // Pin "all" so the newcomer does not join Default (and every screen that
    // follows it). A restricted list already excludes the newcomer.
    defaultList: Array.isArray(defaultList) ? [...defaultList] : beforeIds,
    screenList: [
      ...effectiveAvailablePages(screenOverrides, { availableScreens: defaultList }, pages),
      pageId,
    ],
  };
}

/**
 * Cleanup after deleting a page from the catalog: strip it from Default's list
 * and every screen override, drop an override that would become empty, and drop
 * a start page that pointed at it.
 */
export function pageDeletePlan({ pageId, defaultList, screens }) {
  let nextDefault = null;
  if (Array.isArray(defaultList)) {
    const stripped = defaultList.filter(id => id !== pageId);
    // An empty Default list would hide every remaining page; "all" is the
    // useful fallback (the same fail-open the runtime uses for no list).
    nextDefault = stripped.length ? stripped : null;
  }

  const screenPatches = (screens || []).map(screen => {
    const previous = screen?.overrides || {};
    let next = previous;
    if (Array.isArray(previous.availableScreens) && previous.availableScreens.includes(pageId)) {
      next = { ...next };
      const stripped = previous.availableScreens.filter(id => id !== pageId);
      if (stripped.length) next.availableScreens = stripped;
      else delete next.availableScreens;
    }
    if (next.defaultScreenId === pageId) {
      if (next === previous) next = { ...next };
      delete next.defaultScreenId;
    }
    return { id: screen.id, overrides: next, changed: next !== previous };
  });

  return { defaultList: nextDefault, screens: screenPatches };
}

/**
 * Add or remove one page on a target, following the toggles' rule: a screen
 * that ends up with Default's list drops its override; Default with every page
 * stores null. Turning off the last shown page is refused.
 *
 * @returns {{error: string} | {availableScreens: string[]|null} | {overrides: object}}
 */
export function pageTogglePlan({
  pageId,
  checked,
  targetIsDefault = false,
  targetOverrides = {},
  defaultList,
  pages,
}) {
  const allIds = pageIds(pages);
  const defaultIds = effectiveAvailablePages(null, { availableScreens: defaultList }, pages);
  const current = targetIsDefault
    ? defaultIds
    : effectiveAvailablePages(targetOverrides, { availableScreens: defaultList }, pages);
  const next = new Set(current);
  if (checked) next.add(pageId);
  else next.delete(pageId);
  if (next.size === 0) return { error: "Pick at least one page." };

  const nextIds = allIds.filter(id => next.has(id));
  if (targetIsDefault) {
    return { availableScreens: sameSet(nextIds, allIds) ? null : nextIds };
  }

  const overrides = { ...(targetOverrides || {}) };
  if (sameSet(nextIds, defaultIds)) delete overrides.availableScreens;
  else overrides.availableScreens = nextIds;
  if ("defaultScreenId" in overrides && !next.has(overrides.defaultScreenId)) {
    delete overrides.defaultScreenId;
  }
  return { overrides };
}
