/**
 * Layout utility functions for positioning elements in flexbox layouts.
 */

/**
 * Get the render order for layout elements.
 * Returns an array of element types in the order they should be rendered.
 * @param {Object} config - Layout configuration
 * @param {string} config.orientation - 'landscape' | 'portrait'
 * @param {string} config.sideViewPosition - 'left' | 'right' | 'top' | 'bottom'
 * @param {boolean} config.showVerticalBarLeft - Whether to show vertical bar on left
 * @param {boolean} config.showVerticalBarRight - Whether to show vertical bar on right
 * @param {boolean} config.showVerticalBarBetween - Whether to show vertical bar between
 * @param {boolean} config.showHorizontalBarBetween - Whether to show horizontal bar between
 * @returns {Array<string>} Array of element types in render order
 */
export function getLayoutOrder(config) {
  const {
    orientation,
    sideViewPosition,
    showVerticalBarLeft,
    showVerticalBarRight,
    showVerticalBarBetween,
    showHorizontalBarBetween,
  } = config;

  const elements = [];

  // Always start with left vertical bar if present
  if (showVerticalBarLeft) {
    elements.push("verticalBarLeft");
  }

  // Determine order of calendar and secondary based on orientation and side view position
  if (orientation === "landscape") {
    // Landscape: left/right positioning
    if (sideViewPosition === "left") {
      // Side view on left, calendar on right
      elements.push("secondary");
      // Between bar goes here if present
      if (showVerticalBarBetween) {
        elements.push("verticalBarBetween");
      }
      elements.push("calendar");
    } else {
      // Side view on right, calendar on left
      elements.push("calendar");
      // Between bar goes here if present
      if (showVerticalBarBetween) {
        elements.push("verticalBarBetween");
      }
      elements.push("secondary");
    }
  } else {
    // Portrait: top/bottom positioning
    if (sideViewPosition === "top") {
      // Side view on top, calendar on bottom
      elements.push("secondary");
      // Between bar goes here if present
      if (showHorizontalBarBetween) {
        elements.push("horizontalBarBetween");
      }
      elements.push("calendar");
    } else {
      // Side view on bottom, calendar on top
      elements.push("calendar");
      // Between bar goes here if present
      if (showHorizontalBarBetween) {
        elements.push("horizontalBarBetween");
      }
      elements.push("secondary");
    }
  }

  // Always end with right vertical bar if present
  if (showVerticalBarRight) {
    elements.push("verticalBarRight");
  }

  return elements;
}

export const DASHBOARD_REGION_KINDS = ["calendar", "photos", "service"];
export const MAX_TOP_REGIONS = 8;

export const DASHBOARD_LAYOUT_PRESETS = {
  single: {
    label: "Single Region",
    regions: [{ id: "region-1", kind: "calendar", size: 100 }],
  },
  split_two: {
    label: "Two Regions",
    regions: [
      { id: "region-1", kind: "calendar", size: 70 },
      { id: "region-2", kind: "photos", size: 30 },
    ],
  },
  split_three: {
    label: "Three Regions",
    regions: [
      { id: "region-1", kind: "calendar", size: 50 },
      { id: "region-2", kind: "photos", size: 25 },
      { id: "region-3", kind: "service", size: 25 },
    ],
  },
  split_four: {
    label: "Four Regions",
    regions: [
      { id: "region-1", kind: "calendar", size: 25 },
      { id: "region-2", kind: "photos", size: 25 },
      { id: "region-3", kind: "service", size: 25 },
      { id: "region-4", kind: "service", size: 25 },
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

  return {
    id: screen?.id || createScreenId(),
    name: screen?.name || "Screen",
    layout,
    activeRegionId,
  };
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
    return {
      id,
      kind,
      serviceId: kind === "service" ? region.serviceId || null : null,
      size: clampRegionSize(region.size ?? presetRegion.size ?? 100 / sourceRegions.length),
      split: normalizeRegionSplit(region.split, id),
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
      return {
        ...region,
        kind,
        serviceId: kind === "service" ? existing.serviceId || region.serviceId || null : null,
        size: existing.size ?? region.size,
      };
    }),
  });
}

export function getDashboardRegionOrder(regions, sideViewPosition) {
  if (!Array.isArray(regions) || regions.length <= 1) {
    return regions || [];
  }

  const shouldShowSecondaryFirst = sideViewPosition === "left" || sideViewPosition === "top";
  if (!shouldShowSecondaryFirst) {
    return regions;
  }

  const [primary, secondary, ...rest] = regions;
  return [secondary, primary, ...rest];
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
    return {
      id: sub.id || `${parentId}-${String.fromCharCode(97 + index)}`,
      kind,
      serviceId: kind === "service" ? sub.serviceId || null : null,
      size: clampRegionSize(Number(sub.size) || 100 / subs.length),
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
        serviceId: target.kind === "service" ? target.serviceId || null : null,
        size: 50,
      },
      {
        id: `${parentId}-b`,
        kind: secondaryKind,
        serviceId: null,
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
          serviceId: subA.kind === "service" ? subA.serviceId || null : null,
          size: region.size,
          split: null,
        }
      : region
  );
  return { ...layout, regions };
}

export function setSubRegionContent(layout, topIndex, subIndex, { kind, serviceId }) {
  const region = layout?.regions?.[topIndex];
  if (!region?.split) return layout;
  const subs = region.split.regions.map((sub, index) =>
    index === subIndex
      ? {
          ...sub,
          kind,
          serviceId: kind === "service" ? serviceId || null : null,
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
            serviceId: surviving.kind === "service" ? surviving.serviceId || null : null,
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
