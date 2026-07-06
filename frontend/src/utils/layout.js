/**
 * Layout utility functions for positioning elements in flexbox layouts.
 */

import { CARD_SIZE_KEYS } from "../styles/cardSizeScale.js";

export const DASHBOARD_REGION_KINDS = ["calendar", "photos", "service"];
export const MAX_TOP_REGIONS = 8;

export const DASHBOARD_LAYOUT_PRESETS = {
  single: {
    label: "Single Region",
    regions: [{ id: "region-1", kind: "calendar", instanceIds: [], size: 100 }],
  },
  split_two: {
    label: "Two Regions",
    regions: [
      { id: "region-1", kind: "calendar", instanceIds: [], size: 70 },
      { id: "region-2", kind: "photos", instanceIds: [], size: 30 },
    ],
  },
  split_three: {
    label: "Three Regions",
    regions: [
      { id: "region-1", kind: "calendar", instanceIds: [], size: 50 },
      { id: "region-2", kind: "photos", instanceIds: [], size: 25 },
      { id: "region-3", kind: "service", instanceIds: [], size: 25 },
    ],
  },
  split_four: {
    label: "Four Regions",
    regions: [
      { id: "region-1", kind: "calendar", instanceIds: [], size: 25 },
      { id: "region-2", kind: "photos", instanceIds: [], size: 25 },
      { id: "region-3", kind: "service", instanceIds: [], size: 25 },
      { id: "region-4", kind: "service", instanceIds: [], size: 25 },
    ],
  },
};

export const DEFAULT_DASHBOARD_SCREEN_ID = "screen-home";

export function createDefaultDashboardScreens() {
  return normalizeDashboardScreens({
    version: 2,
    activeScreenId: DEFAULT_DASHBOARD_SCREEN_ID,
    screens: [
      {
        id: DEFAULT_DASHBOARD_SCREEN_ID,
        name: "Home",
        layout: createDashboardLayoutFromPreset("split_two"),
        activeRegionId: "region-1",
      },
    ],
  });
}

export function createDashboardScreenFromPreset(preset, existingScreen = null) {
  const id = existingScreen?.id || createScreenId();
  const layout = createDashboardLayoutFromPreset(preset, existingScreen?.layout);
  return normalizeDashboardScreen({
    id,
    name: existingScreen?.name || DASHBOARD_LAYOUT_PRESETS[layout.preset]?.label || "Screen",
    layout,
    activeRegionId: existingScreen?.activeRegionId || layout.regions[0]?.id || "region-1",
  });
}

export const DEFAULT_CALENDAR_VIEW = Object.freeze({
  mode: "month",
  rolling: false,
  weeks: 4,
  days: 7,
  // Non-rolling month always renders the full month; extraWeeks appends this
  // many look-ahead weeks after it (0 = just the month). Unused by other views.
  extraWeeks: 0,
});

const clampViewInt = (value, lo, hi, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Coerce a calendar region's `view` block into the canonical shape:
 * mode ∈ {month,week,day}, rolling boolean, weeks 1–12, days 1–14,
 * extraWeeks 0–8 (look-ahead weeks after a non-rolling month).
 *
 * The display-override fields (`weekNumbers`, `maxVisibleEvents`) are OPTIONAL:
 * a valid value is kept as a per-region override; anything else is omitted so
 * the region inherits the global setting. Absent = inherit, so there is no
 * migration for existing regions.
 */
export function clampCalendarView(view = {}) {
  const out = {
    mode: ["month", "week", "day"].includes(view.mode) ? view.mode : "month",
    rolling: view.rolling === true || view.rolling === "true" || view.rolling === 1,
    weeks: clampViewInt(view.weeks, 1, 12, DEFAULT_CALENDAR_VIEW.weeks),
    days: clampViewInt(view.days, 1, 14, DEFAULT_CALENDAR_VIEW.days),
    extraWeeks: clampViewInt(view.extraWeeks, 0, 8, DEFAULT_CALENDAR_VIEW.extraWeeks),
  };
  if (view.weekNumbers === true || view.weekNumbers === false) {
    out.weekNumbers = view.weekNumbers;
  }
  const maxVisible = Number(view.maxVisibleEvents);
  if (Number.isFinite(maxVisible)) {
    out.maxVisibleEvents = Math.min(20, Math.max(1, Math.round(maxVisible)));
  }
  return out;
}

const SERVICE_LINK_ACTIONS = ["handoff", "embed", "off"];

/**
 * Coerce a service region's `view` block. Recognises `linkAction` (handoff/
 * embed/off) and `cardSize` (one of the five card-size keys); anything else (or
 * an invalid value) is omitted so the region inherits the default. Absent =
 * inherit.
 */
export function clampServiceView(view = {}) {
  const out = {};
  if (SERVICE_LINK_ACTIONS.includes(view.linkAction)) out.linkAction = view.linkAction;
  if (CARD_SIZE_KEYS.includes(view.cardSize)) out.cardSize = view.cardSize;
  return out;
}

// Calendar and service regions carry a `view`; other kinds get no such key.
const viewForKind = (region, kind) => {
  if (kind === "calendar") {
    return { view: clampCalendarView({ ...DEFAULT_CALENDAR_VIEW, ...(region?.view || {}) }) };
  }
  if (kind === "service") {
    return { view: clampServiceView(region?.view || {}) };
  }
  return {};
};

/**
 * Return a new screens object with `patch` merged into the `view` of region
 * `regionId` on the active screen (searching nested splits). Calendar regions
 * are patched via `clampCalendarView`; service regions via `clampServiceView`.
 * The input is not mutated. No-op for other region kinds.
 */
export function setRegionView(screens, regionId, patch) {
  // JSON round-trip, not structuredClone: `screens` may be a Vue reactive proxy
  // (from the Pinia store), which structuredClone rejects with DataCloneError.
  // The screens config is pure JSON-serializable data, so this is safe.
  const next = JSON.parse(JSON.stringify(screens));
  const active = next.screens.find(s => s.id === next.activeScreenId) || next.screens[0];
  if (!active) return next;
  const visit = regions => {
    for (const region of regions || []) {
      if (region.id === regionId && region.kind === "calendar") {
        region.view = clampCalendarView({
          ...DEFAULT_CALENDAR_VIEW,
          ...(region.view || {}),
          ...patch,
        });
        return true;
      }
      if (region.id === regionId && region.kind === "service") {
        region.view = clampServiceView({ ...(region.view || {}), ...patch });
        return true;
      }
      if (region.split && visit(region.split.regions)) return true;
    }
    return false;
  };
  visit(active.layout?.regions);
  return next;
}

export function normalizeDashboardScreens(screensConfig) {
  const fallback = {
    version: 2,
    activeScreenId: DEFAULT_DASHBOARD_SCREEN_ID,
    screens: [
      {
        id: DEFAULT_DASHBOARD_SCREEN_ID,
        name: "Home",
        layout: createDashboardLayoutFromPreset("split_two"),
        activeRegionId: "region-1",
      },
    ],
  };

  const candidate =
    screensConfig && typeof screensConfig === "object" && Array.isArray(screensConfig.screens)
      ? screensConfig
      : fallback;
  const screens = candidate.screens.length
    ? candidate.screens.map(normalizeDashboardScreen)
    : fallback.screens.map(normalizeDashboardScreen);
  const activeScreenId = screens.some(screen => screen.id === candidate.activeScreenId)
    ? candidate.activeScreenId
    : screens[0].id;

  return {
    version: 2,
    activeScreenId,
    screens,
  };
}

export function normalizeDashboardScreen(screen) {
  const layout = normalizeDashboardLayout(screen?.layout);
  const leafIds = getLeafRegions(layout).map(leaf => leaf.id);
  const activeRegionId = leafIds.includes(screen?.activeRegionId)
    ? screen.activeRegionId
    : leafIds[0] || "region-1";
  const clockBar = normalizeScreenClockBar(screen?.clockBar, layout.regions.length);

  return {
    id: screen?.id || createScreenId(),
    name: screen?.name || "Screen",
    layout,
    activeRegionId,
    clockBar,
  };
}

export const CLOCK_BAR_PERIMETER_POSITIONS = ["top", "bottom", "left", "right"];

/**
 * Normalize a per-screen clock bar override. Returns `null` if no fields are
 * set (the screen inherits the global settings entirely). Position values:
 *   - 'top' | 'bottom' (horizontal mode)
 *   - 'left' | 'right' (vertical mode)
 *   - 'between'         (== between:0; the first gap between top-level regions)
 *   - `between:${i}`    (the i-th gap; clamped to [0, regionsCount - 2])
 */
export function normalizeScreenClockBar(value, regionsCount) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  if (typeof value.enabled === "boolean") out.enabled = value.enabled;
  if (value.mode === "horizontal" || value.mode === "vertical") out.mode = value.mode;
  const position = normalizeClockBarPosition(value.position, regionsCount);
  if (position) out.position = position;
  return Object.keys(out).length ? out : null;
}

export function normalizeClockBarPosition(value, regionsCount) {
  if (CLOCK_BAR_PERIMETER_POSITIONS.includes(value)) return value;
  if (value === "between") return clampBetweenPosition(0, regionsCount);
  if (typeof value === "string") {
    const match = value.match(/^between:(\d+)$/);
    if (match) {
      return clampBetweenPosition(parseInt(match[1], 10), regionsCount);
    }
  }
  return null;
}

function clampBetweenPosition(index, regionsCount) {
  const count = Number.isFinite(regionsCount) ? regionsCount : 0;
  if (count < 2) return "between";
  const maxIndex = count - 2;
  const clamped = Math.max(0, Math.min(maxIndex, Number.isFinite(index) ? index : 0));
  return clamped === 0 ? "between" : `between:${clamped}`;
}

export function getClockBarBetweenIndex(position) {
  if (position === "between") return 0;
  if (typeof position === "string") {
    const match = position.match(/^between:(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

export function isClockBarBetweenPosition(position) {
  return getClockBarBetweenIndex(position) !== null;
}

/**
 * Merge per-screen clock bar overrides with global settings, returning the
 * effective `{ enabled, mode, position }` to use when rendering. Falls back to
 * a sane perimeter position when the resolved (mode, position) pair is
 * inconsistent (e.g. horizontal mode with a 'left' override).
 */
export function resolveClockBarForScreen(screen, globalSettings = {}) {
  const override = screen?.clockBar || {};
  const enabled =
    typeof override.enabled === "boolean" ? override.enabled : Boolean(globalSettings.enabled);
  const mode =
    override.mode === "horizontal" || override.mode === "vertical"
      ? override.mode
      : globalSettings.mode === "vertical"
        ? "vertical"
        : "horizontal";
  const requested = override.position ?? globalSettings.position ?? null;
  const regionsCount = screen?.layout?.regions?.length || 0;
  const position = coerceClockBarPosition(requested, mode, regionsCount);
  return { enabled, mode, position };
}

function coerceClockBarPosition(position, mode, regionsCount) {
  const betweenIndex = getClockBarBetweenIndex(position);
  if (betweenIndex !== null) {
    if (regionsCount < 2) return mode === "vertical" ? "left" : "top";
    return clampBetweenPosition(betweenIndex, regionsCount);
  }
  if (mode === "horizontal") {
    return position === "top" || position === "bottom" ? position : "top";
  }
  return position === "left" || position === "right" ? position : "left";
}

/**
 * Build the global clock bar settings object that screen overrides resolve
 * against. Centralises the contract so callers don't hard-code `enabled: true`.
 */
export function getGlobalClockBarSettings(config = {}) {
  return {
    enabled: true,
    mode: config.clockBarMode === "vertical" ? "vertical" : "horizontal",
    position: normalizeClockBarPosition(config.clockBarPosition, 2) || "top",
  };
}

/**
 * Given a between-style position and a region count, return the gap index at
 * which a between-bar should render, or `null` if the bar should not appear
 * (non-between position, or fewer than 2 regions). The index is clamped to the
 * last available gap so stale `between:N` values fall back gracefully.
 */
export function getClockBarPlacementGap(position, regionsCount) {
  const idx = getClockBarBetweenIndex(position);
  if (idx === null) return null;
  if (!Number.isFinite(regionsCount) || regionsCount < 2) return null;
  return Math.max(0, Math.min(idx, regionsCount - 2));
}

function inferModeForPerimeter(position) {
  if (position === "top" || position === "bottom") return "horizontal";
  if (position === "left" || position === "right") return "vertical";
  return null;
}

/**
 * Decide how a per-screen position change should be applied. Returns:
 *   - `null` if the position is invalid
 *   - `{ clear: true }` if the override should be removed (resolved value
 *     would already match the globals exactly)
 *   - `{ patch: {...} }` with the minimal patch to merge into `screen.clockBar`
 *
 * When the new position is a perimeter, the patch also pins `mode` so the
 * screen owns its orientation and stays valid if global mode flips later.
 */
export function computeClockBarPositionUpdate(screen, position, globalSettings = {}) {
  const regionsCount = screen?.layout?.regions?.length || 0;
  const normalized = normalizeClockBarPosition(position, regionsCount);
  if (!normalized) return null;

  const sideMode = inferModeForPerimeter(normalized);
  const override = screen?.clockBar || {};
  const overrideHasMode = override.mode === "horizontal" || override.mode === "vertical";
  const overrideHasEnabled = typeof override.enabled === "boolean";

  // Clear the override only when the resolved value would already match the
  // globals on every dimension — otherwise we'd silently change orientation
  // (e.g. dropping on 'top' while global mode is 'vertical').
  const positionMatchesGlobal = normalized === globalSettings.position;
  const modeMatchesGlobal = sideMode === null || sideMode === globalSettings.mode;
  if (positionMatchesGlobal && modeMatchesGlobal && !overrideHasMode && !overrideHasEnabled) {
    return { clear: true };
  }

  const patch = { position: normalized };
  if (sideMode) patch.mode = sideMode;
  return { patch };
}

/**
 * Decide how a per-screen mode change should be applied. Returns the minimal
 * patch to merge into `screen.clockBar`. If the resolved position no longer
 * matches the new mode (and isn't a between gap, which is mode-agnostic), the
 * patch flips the position to a default perimeter for the new mode.
 */
export function computeClockBarModeUpdate(screen, mode, globalSettings = {}) {
  if (mode !== "horizontal" && mode !== "vertical") return null;
  const resolved = resolveClockBarForScreen(screen, globalSettings);
  const patch = { mode };
  const isPerimeter = CLOCK_BAR_PERIMETER_POSITIONS.includes(resolved.position);
  const wrongSide =
    isPerimeter &&
    ((mode === "horizontal" && resolved.position !== "top" && resolved.position !== "bottom") ||
      (mode === "vertical" && resolved.position !== "left" && resolved.position !== "right"));
  if (wrongSide) {
    patch.position = mode === "horizontal" ? "top" : "left";
  }
  return { patch };
}

export function getLeafRegions(layout) {
  if (!layout?.regions) return [];
  return layout.regions.flatMap(region =>
    region.split ? region.split.regions.map(sub => ({ ...sub, parentId: region.id })) : [region]
  );
}

export function getActiveDashboardScreen(screensConfig) {
  const normalized = normalizeDashboardScreens(screensConfig);
  return (
    normalized.screens.find(screen => screen.id === normalized.activeScreenId) ||
    normalized.screens[0]
  );
}

export function getActiveDashboardRegion(screen) {
  const normalized = normalizeDashboardScreen(screen);
  const leaves = getLeafRegions(normalized.layout);
  return leaves.find(leaf => leaf.id === normalized.activeRegionId) || leaves[0];
}

export function setActiveDashboardScreen(screensConfig, screenId) {
  const normalized = normalizeDashboardScreens(screensConfig);
  if (!normalized.screens.some(screen => screen.id === screenId)) {
    return normalized;
  }
  return {
    ...normalized,
    activeScreenId: screenId,
  };
}

export function setActiveDashboardRegion(screensConfig, regionId) {
  const config = normalizeDashboardScreens(screensConfig);
  const activeScreen = getActiveDashboardScreen(config);
  if (!activeScreen) return config;
  const isLeaf = getLeafRegions(activeScreen.layout).some(region => region.id === regionId);
  if (!isLeaf) return config;
  return {
    ...config,
    screens: config.screens.map(screen =>
      screen.id === activeScreen.id ? { ...screen, activeRegionId: regionId } : screen
    ),
  };
}

export function cycleDashboardScreen(screensConfig, direction = 1) {
  const normalized = normalizeDashboardScreens(screensConfig);
  if (normalized.screens.length <= 1) return normalized;
  const currentIndex = normalized.screens.findIndex(
    screen => screen.id === normalized.activeScreenId
  );
  const nextIndex =
    (currentIndex + direction + normalized.screens.length) % normalized.screens.length;
  return {
    ...normalized,
    activeScreenId: normalized.screens[nextIndex].id,
  };
}

export function cycleActiveDashboardRegion(screensConfig, direction = 1) {
  const normalized = normalizeDashboardScreens(screensConfig);
  const screenIndex = normalized.screens.findIndex(
    screen => screen.id === normalized.activeScreenId
  );
  if (screenIndex < 0) return normalized;
  const screen = normalized.screens[screenIndex];
  const leaves = getLeafRegions(screen.layout);
  if (leaves.length <= 1) return normalized;
  const currentIndex = Math.max(
    0,
    leaves.findIndex(leaf => leaf.id === screen.activeRegionId)
  );
  const nextIndex = (currentIndex + direction + leaves.length) % leaves.length;
  const screens = normalized.screens.map((candidate, index) =>
    index === screenIndex ? { ...candidate, activeRegionId: leaves[nextIndex].id } : candidate
  );
  return {
    ...normalized,
    screens,
  };
}

function createScreenId() {
  return `screen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createLegacyDashboardLayout(config = {}) {
  const calendarSize = clampRegionSize(config.calendarSplit ?? 70);
  const secondaryKind = config.lastSideViewMode === "web_services" ? "service" : "photos";

  return {
    version: 1,
    preset: "split_two",
    regions: [
      { id: "region-1", kind: "calendar", size: calendarSize },
      {
        id: "region-2",
        kind: secondaryKind,
        serviceId: null,
        instanceIds: [],
        size: 100 - calendarSize,
      },
    ],
  };
}

export function normalizeDashboardLayout(layout, legacyConfig = {}) {
  const fallback = createLegacyDashboardLayout(legacyConfig);
  const candidate =
    layout && typeof layout === "object" && Array.isArray(layout.regions) ? layout : fallback;
  const preset = normalizePreset(candidate.preset) || fallback.preset;
  const presetRegions = DASHBOARD_LAYOUT_PRESETS[preset]?.regions || fallback.regions;
  const sourceRegions = candidate.regions.length > 0 ? candidate.regions : presetRegions;
  const regions = sourceRegions.slice(0, MAX_TOP_REGIONS).map((region, index) => {
    const presetRegion = presetRegions[index] ||
      fallback.regions[index] || {
        id: `region-${index + 1}`,
        kind: "service",
        size: 100 / Math.max(1, sourceRegions.length),
      };
    const kind = DASHBOARD_REGION_KINDS.includes(region.kind) ? region.kind : presetRegion.kind;
    const id = region.id || presetRegion.id || `region-${index + 1}`;
    const instanceIds = normalizeRegionInstanceIds(region, kind);
    return {
      id,
      kind,
      serviceId: kind === "service" ? instanceIds[0] || null : null,
      instanceIds,
      size: clampRegionSize(region.size ?? presetRegion.size ?? 100 / sourceRegions.length),
      split: normalizeRegionSplit(region.split, id),
      ...viewForKind(region, kind),
    };
  });

  return normalizeRegionSizes({
    version: 1,
    preset,
    direction: normalizeDirection(candidate.direction),
    regions,
  });
}

export function normalizeDirection(direction) {
  return direction === "row" || direction === "column" ? direction : null;
}

export function getLayoutDirection(layout, displayOrientation) {
  const stored = normalizeDirection(layout?.direction);
  if (stored) return stored;
  return displayOrientation === "portrait" ? "column" : "row";
}

export function getSplitDirection(split, parentDirection) {
  const stored = normalizeDirection(split?.direction);
  if (stored) return stored;
  return parentDirection === "column" ? "row" : "column";
}

export function createDashboardLayoutFromPreset(preset, existingLayout = null) {
  const normalizedPreset = normalizePreset(preset) || "split_two";
  const presetConfig =
    DASHBOARD_LAYOUT_PRESETS[normalizedPreset] || DASHBOARD_LAYOUT_PRESETS.split_two;
  const existingRegions = existingLayout?.regions || [];
  return normalizeDashboardLayout({
    version: 1,
    preset: normalizedPreset,
    direction: existingLayout?.direction,
    regions: presetConfig.regions.map((region, index) => {
      const existing = existingRegions[index] || {};
      const kind = DASHBOARD_REGION_KINDS.includes(existing.kind) ? existing.kind : region.kind;
      const instanceIds = normalizeRegionInstanceIds(existing, kind);
      return {
        ...region,
        kind,
        serviceId: kind === "service" ? instanceIds[0] || region.serviceId || null : null,
        instanceIds: instanceIds.length ? instanceIds : normalizeRegionInstanceIds(region, kind),
        size: existing.size ?? region.size,
      };
    }),
  });
}

export function getRegionAxisStyle(region, axis) {
  const size = `${clampRegionSize(region?.size ?? 100, true)}%`;
  const isColumn = axis === "portrait" || axis === "column";
  return isColumn ? { height: size, width: "100%" } : { width: size, height: "100%" };
}

export function resizeAdjacentRegions(regions, firstIndex, firstSize, minSize = 10) {
  if (!Array.isArray(regions) || regions.length <= 1) return regions || [];
  const secondIndex = firstIndex + 1;
  if (firstIndex < 0 || secondIndex >= regions.length) return regions;

  const currentFirst = Number(regions[firstIndex].size) || 0;
  const currentSecond = Number(regions[secondIndex].size) || 0;
  const pairTotal = currentFirst + currentSecond;
  const maxFirst = pairTotal - minSize;
  const nextFirst = Math.max(minSize, Math.min(maxFirst, Number(firstSize)));
  const nextSecond = pairTotal - nextFirst;

  return normalizeRegionPercentages(
    regions.map((region, index) => {
      if (index === firstIndex) return { ...region, size: nextFirst };
      if (index === secondIndex) return { ...region, size: nextSecond };
      return { ...region };
    }),
    minSize
  );
}

function normalizeRegionSplit(split, parentId) {
  if (!split || typeof split !== "object" || !Array.isArray(split.regions)) return null;
  const subs = split.regions.slice(0, MAX_TOP_REGIONS);
  if (subs.length < 2) return null;
  const normalized = subs.map((sub, index) => {
    const kind = DASHBOARD_REGION_KINDS.includes(sub.kind) ? sub.kind : "photos";
    const instanceIds = normalizeRegionInstanceIds(sub, kind);
    return {
      id: sub.id || `${parentId}-${String.fromCharCode(97 + index)}`,
      kind,
      serviceId: kind === "service" ? instanceIds[0] || null : null,
      instanceIds,
      size: clampRegionSize(Number(sub.size) || 100 / subs.length),
      ...viewForKind(sub, kind),
    };
  });
  return {
    direction: normalizeDirection(split.direction),
    regions: normalizeRegionPercentages(normalized),
  };
}

export function setLayoutDirection(layout, direction) {
  return { ...layout, direction: normalizeDirection(direction) };
}

export function setSplitDirection(layout, topIndex, direction) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const regions = layout.regions.map((candidate, index) =>
    index === topIndex
      ? {
          ...candidate,
          split: {
            ...candidate.split,
            direction: normalizeDirection(direction),
          },
        }
      : candidate
  );
  return { ...layout, regions };
}

export function addTopRegion(layout, opts = {}) {
  if (!layout?.regions) return layout;
  if (layout.regions.length >= MAX_TOP_REGIONS) return layout;
  const nextCount = layout.regions.length + 1;
  const newRegionSize = Math.max(10, Math.round(100 / nextCount));
  const remaining = 100 - newRegionSize;
  const currentTotal = layout.regions.reduce((sum, region) => sum + (Number(region.size) || 0), 0);
  const denom = currentTotal > 0 ? currentTotal : 100;
  const scaled = layout.regions.map(region => ({
    ...region,
    size: Math.max(10, Math.round(((Number(region.size) || 0) / denom) * remaining)),
  }));
  const newRegion = {
    id: opts.id || nextRegionId(layout.regions),
    kind: opts.kind || "service",
    serviceId: null,
    instanceIds: normalizeRegionInstanceIds(opts, opts.kind || "service"),
    size: newRegionSize,
    split: null,
  };
  return normalizeRegionSizes({
    ...layout,
    regions: [...scaled, newRegion],
  });
}

export function removeTopRegion(layout, topIndex) {
  if (!layout?.regions || layout.regions.length <= 1) return layout;
  if (topIndex < 0 || topIndex >= layout.regions.length) return layout;
  const regions = layout.regions.filter((_, index) => index !== topIndex);
  return normalizeRegionSizes({ ...layout, regions });
}

function nextRegionId(regions) {
  const used = new Set(regions.map(region => region.id));
  let counter = regions.length + 1;
  while (used.has(`region-${counter}`)) counter += 1;
  return `region-${counter}`;
}

export function splitTopRegion(layout, topIndex) {
  if (!layout?.regions || topIndex < 0 || topIndex >= layout.regions.length) return layout;
  const target = layout.regions[topIndex];
  if (target.split) return layout;
  const parentId = target.id;
  const secondaryKind = target.kind === "calendar" ? "photos" : "calendar";
  const split = {
    regions: [
      {
        id: `${parentId}-a`,
        kind: target.kind,
        serviceId:
          target.kind === "service" ? target.instanceIds?.[0] || target.serviceId || null : null,
        instanceIds: normalizeRegionInstanceIds(target, target.kind),
        size: 50,
      },
      {
        id: `${parentId}-b`,
        kind: secondaryKind,
        serviceId: null,
        instanceIds: [],
        size: 50,
      },
    ],
  };
  const regions = layout.regions.map((region, index) =>
    index === topIndex ? { ...region, split } : region
  );
  return { ...layout, regions };
}

export function unsplitTopRegion(layout, topIndex) {
  if (!layout?.regions || topIndex < 0 || topIndex >= layout.regions.length) return layout;
  const target = layout.regions[topIndex];
  if (!target.split) return layout;
  const subA = target.split.regions[0];
  const regions = layout.regions.map((region, index) =>
    index === topIndex
      ? {
          id: region.id,
          kind: subA.kind,
          serviceId:
            subA.kind === "service" ? subA.instanceIds?.[0] || subA.serviceId || null : null,
          instanceIds: normalizeRegionInstanceIds(subA, subA.kind),
          size: region.size,
          split: null,
        }
      : region
  );
  return { ...layout, regions };
}

export function setSubRegionContent(layout, topIndex, subIndex, { kind, serviceId, instanceIds }) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const subs = region.split.regions.map((sub, index) =>
    index === subIndex
      ? {
          ...sub,
          kind,
          serviceId: kind === "service" ? instanceIds?.[0] || serviceId || null : null,
          instanceIds: normalizeRegionInstanceIds({ serviceId, instanceIds }, kind),
        }
      : sub
  );
  const regions = layout.regions.map((candidate, index) =>
    index === topIndex ? { ...candidate, split: { ...candidate.split, regions: subs } } : candidate
  );
  return { ...layout, regions };
}

export function resizeSubRegion(layout, topIndex, subIndex, size) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const subs = region.split.regions;
  if (subs.length <= 1) return layout;
  let next;
  if (subIndex >= subs.length - 1) {
    const firstIndex = subIndex - 1;
    const pairTotal = Number(subs[firstIndex].size) + Number(subs[subIndex].size);
    next = resizeAdjacentRegions(subs, firstIndex, pairTotal - size);
  } else {
    next = resizeAdjacentRegions(subs, subIndex, size);
  }
  return updateLayoutSplit(layout, topIndex, next);
}

export function resizeSubRegionPair(layout, topIndex, firstIndex, firstSize) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const subs = resizeAdjacentRegions(region.split.regions, firstIndex, firstSize);
  return updateLayoutSplit(layout, topIndex, subs);
}

export function addSubRegion(layout, topIndex, opts = {}) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  if (region.split.regions.length >= MAX_TOP_REGIONS) return layout;
  const nextCount = region.split.regions.length + 1;
  const newSize = Math.max(10, Math.round(100 / nextCount));
  const remaining = 100 - newSize;
  const total = region.split.regions.reduce((sum, sub) => sum + (Number(sub.size) || 0), 0);
  const denom = total > 0 ? total : 100;
  const scaled = region.split.regions.map(sub => ({
    ...sub,
    size: Math.max(10, Math.round(((Number(sub.size) || 0) / denom) * remaining)),
  }));
  const newSub = {
    id: opts.id || nextSubId(region.id, region.split.regions),
    kind: opts.kind || "service",
    serviceId: null,
    size: newSize,
  };
  return updateLayoutSplit(layout, topIndex, [...scaled, newSub]);
}

export function removeSubRegion(layout, topIndex, subIndex) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const subs = region.split.regions;
  if (subIndex < 0 || subIndex >= subs.length) return layout;
  if (subs.length <= 2) {
    // Falling below 2 collapses the split entirely; keep the surviving sub's content.
    const surviving = subs[subIndex === 0 ? 1 : 0];
    const regions = layout.regions.map((candidate, index) =>
      index === topIndex
        ? {
            id: candidate.id,
            kind: surviving.kind,
            serviceId:
              surviving.kind === "service"
                ? surviving.instanceIds?.[0] || surviving.serviceId || null
                : null,
            instanceIds: normalizeRegionInstanceIds(surviving, surviving.kind),
            size: candidate.size,
            split: null,
          }
        : candidate
    );
    return { ...layout, regions };
  }
  const next = subs.filter((_, index) => index !== subIndex);
  return updateLayoutSplit(layout, topIndex, next);
}

function updateLayoutSplit(layout, topIndex, subs) {
  const normalized = subs.length >= 2 ? normalizeRegionPercentages(subs) : subs;
  const regions = layout.regions.map((candidate, index) =>
    index === topIndex
      ? { ...candidate, split: { ...candidate.split, regions: normalized } }
      : candidate
  );
  return { ...layout, regions };
}

function normalizeRegionInstanceIds(region, kind) {
  if (!region || (kind !== "calendar" && kind !== "photos" && kind !== "service")) return [];
  const rawIds = Array.isArray(region.instanceIds)
    ? region.instanceIds
    : region.instanceId
      ? [region.instanceId]
      : region.serviceId
        ? [region.serviceId]
        : [];
  const ids = [
    ...new Set(rawIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())),
  ];
  return kind === "service" ? ids.slice(0, 1) : ids;
}

function nextSubId(parentId, subs) {
  const used = new Set(subs.map(sub => sub.id));
  for (let i = 0; i < 26; i += 1) {
    const candidate = `${parentId}-${String.fromCharCode(97 + i)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${parentId}-${subs.length + 1}`;
}

function normalizeRegionSizes(layout) {
  if (!layout.regions || layout.regions.length === 0) {
    return layout;
  }

  if (layout.regions.length === 1) {
    return {
      ...layout,
      regions: [{ ...layout.regions[0], size: 100 }],
    };
  }

  if (layout.regions.length === 2) {
    const primarySize = clampRegionSize(layout.regions[0].size);
    const secondarySize = 100 - primarySize;
    return {
      ...layout,
      regions: layout.regions.map((region, index) => ({
        ...region,
        size: index === 0 ? primarySize : secondarySize,
      })),
    };
  }

  return {
    ...layout,
    regions: normalizeRegionPercentages(layout.regions),
  };
}

function normalizeRegionPercentages(regions, minSize = 10) {
  if (!regions.length) return regions;
  if (regions.length === 1) return [{ ...regions[0], size: 100 }];

  const sizes = regions.map(region => Math.max(minSize, Number(region.size) || minSize));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const normalized = regions.map((region, index) => ({
    ...region,
    size: Math.round((sizes[index] / total) * 100),
  }));
  const diff = 100 - normalized.reduce((sum, region) => sum + region.size, 0);
  if (diff !== 0) {
    const targetIndex = normalized.findIndex(region => region.size + diff >= minSize);
    const index = targetIndex >= 0 ? targetIndex : 0;
    normalized[index] = {
      ...normalized[index],
      size: normalized[index].size + diff,
    };
  }
  return normalized.map(region => ({
    ...region,
    size: clampRegionSize(region.size),
  }));
}

function normalizePreset(preset) {
  if (DASHBOARD_LAYOUT_PRESETS[preset]) return preset;
  if (
    [
      "calendar_photos",
      "calendar_service",
      "service_service",
      "calendar_only",
      "photos_only",
      "service_only",
    ].includes(preset)
  ) {
    return preset.endsWith("_only") ? "single" : "split_two";
  }
  return null;
}

function clampRegionSize(size, allowFull = false) {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize)) return 50;
  if (allowFull && numericSize === 100) return 100;
  return Math.max(10, Math.min(90, numericSize));
}
