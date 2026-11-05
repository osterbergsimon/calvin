// The clock bar design (docs/design/2026-11-04-clock-bar-editor.md §4).
//
// One household key, `clockBarDesign`, describes which parts of the bar show,
// in which zone and order, and each part's own options. Both bar shapes carry
// their own design.
//
// This module is the only reader. With no stored design it derives one from the
// old keys so an existing setup renders exactly what it rendered before. The
// editor writes `clockBarDesign` only; the old keys stay as the fallback.

export const CLOCK_BAR_DESIGN_VERSION = 1;

export const CLOCK_BAR_SHAPES = ["horizontal", "vertical"];

export const CLOCK_BAR_ZONE_KEYS = {
  horizontal: ["left", "center", "right"],
  vertical: ["top", "middle", "bottom"],
};

export const CLOCK_BAR_DEFAULT_ZONE = {
  horizontal: "right",
  vertical: "bottom",
};

export const CLOCK_BAR_MIDDLE_ZONE = {
  horizontal: "center",
  vertical: "middle",
};

export const CLOCK_BAR_SHAPE_LABELS = {
  horizontal: "Top / bottom bar",
  vertical: "Side bar",
};

export const CLOCK_BAR_ZONE_LABELS = {
  horizontal: { left: "Left", center: "Centre", right: "Right" },
  vertical: { top: "Top", middle: "Middle", bottom: "Bottom" },
};

export const CLOCK_BAR_FIXED_PARTS = ["logo", "room", "pageDots", "time", "date", "status"];

export const CLOCK_BAR_PART_LABELS = {
  logo: "Calvin logo",
  room: "Room name",
  pageDots: "Page dots",
  time: "Time",
  date: "Date",
  status: "Status & menu",
};

// The token that stands for "every tile not listed elsewhere", so a new plugin
// instance appears where the old tiles sat.
export const CLOCK_BAR_TILES = "tiles";

// Builder-chosen px steps (§8). "m"/"normal" equal today's defaults so a
// default setup renders pixel-identical.
export const CLOCK_BAR_SIZE_TABLES = {
  horizontal: {
    time: { s: 14, m: 16, l: 24, xl: 32 },
    date: { s: 12, m: 14, l: 18 },
    logo: { s: 13, m: 16, l: 20 },
    room: { s: 13, m: 16, l: 20 },
    padding: { slim: 4, normal: 8, roomy: 12 },
    tile: { s: 14, m: 16, l: 20 },
  },
  vertical: {
    time: { s: 14, m: 18, l: 28, xl: 36 },
    date: { s: 10, m: 11, l: 14 },
    logo: { s: 13, m: 16, l: 20 },
    room: { s: 13, m: 16, l: 20 },
    padding: { slim: 4, normal: 8, roomy: 12 },
    tile: { s: 14, m: 16, l: 20 },
  },
};

export const CLOCK_BAR_PART_SIZE_STEPS = {
  time: ["s", "m", "l", "xl"],
  date: ["s", "m", "l"],
  logo: ["s", "m", "l"],
  room: ["s", "m", "l"],
};

export const CLOCK_BAR_PART_SIZE_LABELS = {
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
};

const MAX_CUSTOM_SIZE = 200;

export const isTilePart = partId =>
  typeof partId === "string" && partId.startsWith("tile:") && partId.length > 5;

export const tilePartId = instanceId => `tile:${instanceId}`;

export const tileInstanceId = partId => (isTilePart(partId) ? partId.slice(5) : null);

export function asBoolean(value) {
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

const tileInstances = services =>
  (Array.isArray(services) ? services : []).filter(
    service => service?.id && service.statusbar_schema?.kind
  );

const serviceById = services => {
  const map = {};
  for (const service of tileInstances(services)) map[service.id] = service;
  return map;
};

const defaultParts = shape => ({
  logo: { size: "m" },
  room: { size: "m" },
  pageDots: {},
  time: { size: "m", seconds: false, style: "upright" },
  date: { size: "m", underTime: shape === "vertical", style: "line" },
});

function defaultZones(shape) {
  return shape === "horizontal"
    ? {
        left: ["logo", "room", "pageDots"],
        center: ["time", "date"],
        right: [CLOCK_BAR_TILES, "status"],
      }
    : { top: ["logo", "pageDots"], middle: ["time", "date"], bottom: [CLOCK_BAR_TILES, "status"] };
}

export function defaultClockBarShape(shape) {
  return {
    zones: defaultZones(shape),
    hidden: shape === "vertical" ? ["room"] : [],
    parts: defaultParts(shape),
    barHeight: "normal",
    tileSize: "m",
  };
}

const removeToken = (zones, token) => {
  for (const key of Object.keys(zones)) {
    zones[key] = zones[key].filter(entry => entry !== token);
  }
};

const normalizeSizeValue = (value, table, allowed) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    const match = Object.entries(table).find(
      ([step, px]) => px === rounded && allowed.includes(step)
    );
    return match ? match[0] : Math.max(0, Math.min(MAX_CUSTOM_SIZE, rounded));
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (allowed.includes(lower)) return lower;
  }
  return "m";
};

const sizePx = (size, table) => {
  if (typeof size === "number") return size;
  return table[size] ?? table.m ?? 0;
};

const stepFor = (shape, kind, value, allowed) =>
  normalizeSizeValue(value, CLOCK_BAR_SIZE_TABLES[shape][kind], allowed);

const paddingStepFor = (shape, value) =>
  normalizeSizeValue(value, CLOCK_BAR_SIZE_TABLES[shape].padding, ["slim", "normal", "roomy"]);

export function clockBarSizePx(shape, kind, size) {
  const table = CLOCK_BAR_SIZE_TABLES[shape]?.[kind];
  return table ? sizePx(size, table) : 0;
}

/** The selectable steps for a part, with Custom shown by the rail when needed. */
export function clockBarPartSizeOptions(partId) {
  const steps = CLOCK_BAR_PART_SIZE_STEPS[partId] || [];
  return steps.map(step => ({ value: step, label: CLOCK_BAR_PART_SIZE_LABELS[step] }));
}

function deriveLegacyShape(shape, config, services) {
  const source = config || {};
  const zones = defaultZones(shape);
  const hidden = shape === "vertical" ? ["room"] : [];
  const parts = defaultParts(shape);

  if (!source.clockShowDate) {
    removeToken(zones, "date");
    if (!hidden.includes("date")) hidden.push("date");
  }

  if (source.clockBarShowLogo === false) {
    removeToken(zones, "logo");
    if (!hidden.includes("logo")) hidden.push("logo");
  }

  parts.time.seconds = Boolean(source.clockShowSeconds);

  if (shape === "horizontal") {
    parts.date.underTime = source.clockBarLayout === "two-lines";
    parts.time.style = "upright";
    parts.date.style = "line";
  } else {
    const layout =
      source.clockBarVerticalLayout ||
      (source.clockBarLayout === "vertical-compact" ? "compact-time" : "upright");
    const stackedTime = ["compact-time", "compact-time-date", "vertical-compact"].includes(layout);
    parts.time.style = stackedTime ? "stacked" : "upright";
    parts.date.style = layout === "compact-time-date" ? "stacked" : "line";
    // On the side bar the date always sits under the time (§7.3).
    parts.date.underTime = true;
  }

  if (shape === "horizontal") {
    parts.time.size = stepFor(shape, "time", source.clockBarFontSize ?? 16, ["s", "m", "l", "xl"]);
    parts.date.size = stepFor(shape, "date", source.clockBarDateFontSize ?? 14, ["s", "m", "l"]);
    parts.logo.size = "m";
    parts.room.size = "m";
  } else {
    parts.time.size = stepFor(shape, "time", source.clockBarVerticalFontSize ?? 18, [
      "s",
      "m",
      "l",
      "xl",
    ]);
    parts.date.size = stepFor(shape, "date", source.clockBarVerticalDateFontSize ?? 11, [
      "s",
      "m",
      "l",
    ]);
  }

  const padding = shape === "horizontal" ? source.clockBarPadding : source.clockBarVerticalPadding;
  const tileSize =
    shape === "horizontal" ? source.clockBarPluginItemSize : source.clockBarVerticalPluginItemSize;

  for (const service of tileInstances(services)) {
    if (Object.prototype.hasOwnProperty.call(service.config || {}, "show_in_statusbar")) {
      if (!asBoolean(service.config.show_in_statusbar)) {
        const token = tilePartId(service.id);
        if (!hidden.includes(token)) hidden.push(token);
      }
    }
  }

  return {
    zones,
    hidden,
    parts,
    barHeight: paddingStepFor(shape, padding ?? 8),
    tileSize: stepFor(shape, "tile", tileSize ?? 16, ["s", "m", "l"]),
  };
}

function normalizePart(shape, partId, raw) {
  const defaults = defaultParts(shape)[partId] || {};
  const source = raw && typeof raw === "object" ? raw : {};
  const next = { ...defaults };
  if ("size" in defaults) {
    const allowed = CLOCK_BAR_PART_SIZE_STEPS[partId] || ["s", "m", "l"];
    next.size = normalizeSizeValue(
      source.size ?? defaults.size,
      CLOCK_BAR_SIZE_TABLES[shape][partId],
      allowed
    );
  }
  if ("seconds" in defaults) next.seconds = Boolean(source.seconds);
  if ("underTime" in defaults) next.underTime = Boolean(source.underTime);
  if ("style" in defaults) {
    const allowed = shape === "horizontal" ? ["upright"] : ["upright", "stacked"];
    next.style = allowed.includes(source.style) ? source.style : defaults.style;
    if (partId === "date" && shape === "vertical") next.style = "line";
  }
  return next;
}

function normalizeStoredShape(shape, raw) {
  if (!raw || typeof raw !== "object") return null;
  const defaults = defaultClockBarShape(shape);
  const zones = {};
  for (const key of CLOCK_BAR_ZONE_KEYS[shape]) {
    const list = raw.zones?.[key];
    zones[key] = Array.isArray(list)
      ? list.filter(entry => typeof entry === "string" && entry.length > 0 && entry.length <= 120)
      : [...defaults.zones[key]];
  }
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter(
        entry => typeof entry === "string" && entry.length > 0 && entry.length <= 120
      )
    : [...defaults.hidden];
  const parts = {};
  for (const partId of ["logo", "room", "pageDots", "time", "date"]) {
    parts[partId] = normalizePart(shape, partId, raw.parts?.[partId]);
  }
  return {
    zones,
    hidden,
    parts,
    barHeight: paddingStepFor(shape, raw.barHeight ?? "normal"),
    tileSize: normalizeSizeValue(raw.tileSize ?? "m", CLOCK_BAR_SIZE_TABLES[shape].tile, [
      "s",
      "m",
      "l",
    ]),
  };
}

function resolvedParts(shape, stored) {
  const table = CLOCK_BAR_SIZE_TABLES[shape];
  const parts = {};
  for (const partId of ["logo", "room", "pageDots", "time", "date"]) {
    const part = stored.parts[partId] || {};
    const next = { ...part };
    if (partId === "logo" || partId === "room" || partId === "time" || partId === "date") {
      next.sizePx = sizePx(next.size, table[partId]);
    }
    parts[partId] = next;
  }
  parts.status = {};
  return parts;
}

/**
 * Resolve one shape from the stored design (or the old keys when absent).
 *
 * The returned zones hold concrete part ids: the `tiles` placeholder has been
 * expanded, unknown ids have been dropped, a deleted instance is gone and
 * Status & menu is always present somewhere.
 */
function resolveShape(shape, stored, config, services, hasDesign) {
  const tileIds = tileInstances(services).map(service => service.id);
  const knownTiles = new Set(tileIds.map(tilePartId));
  const map = serviceById(services);

  const validFixed = new Set(CLOCK_BAR_FIXED_PARTS);
  const isValidToken = token =>
    validFixed.has(token) ||
    token === CLOCK_BAR_TILES ||
    (isTilePart(token) && knownTiles.has(token));

  const hiddenTokens = [...new Set(stored.hidden.filter(isValidToken))];
  const hiddenSet = new Set(hiddenTokens.filter(token => token !== "status"));
  const pinnedTiles = new Set();
  for (const key of CLOCK_BAR_ZONE_KEYS[shape]) {
    for (const token of stored.zones[key] || []) {
      if (isTilePart(token)) pinnedTiles.add(token);
    }
  }
  for (const token of hiddenTokens) {
    if (isTilePart(token)) pinnedTiles.add(token);
  }

  const zones = {};
  const seen = new Set();
  const push = (zoneKey, token) => {
    if (seen.has(token)) return;
    seen.add(token);
    zones[zoneKey].push(token);
  };

  for (const zoneKey of CLOCK_BAR_ZONE_KEYS[shape]) {
    zones[zoneKey] = [];
    const list = stored.zones[zoneKey] || [];
    for (const token of list) {
      if (!isValidToken(token)) continue;
      if (token === CLOCK_BAR_TILES) {
        for (const id of tileIds) {
          const tokenId = tilePartId(id);
          if (pinnedTiles.has(tokenId) || hiddenSet.has(tokenId)) continue;
          // The placeholder is not an explicit listing: a tile whose own flag
          // is off stays hidden, as it would have before the design existed.
          const flag = map[id]?.config?.show_in_statusbar;
          if (flag !== undefined && !asBoolean(flag)) {
            hiddenSet.add(tokenId);
            continue;
          }
          push(zoneKey, tokenId);
        }
        continue;
      }
      if (token === "status" && hiddenSet.has(token)) continue;
      push(zoneKey, token);
    }
  }

  // A tile the design does not mention: a new instance goes where the `tiles`
  // placeholder is (or the default zone), unless the plugin itself hides it.
  const placeholderZone = CLOCK_BAR_ZONE_KEYS[shape].find(key =>
    (stored.zones[key] || []).includes(CLOCK_BAR_TILES)
  );
  const fallbackZone = placeholderZone || CLOCK_BAR_DEFAULT_ZONE[shape];
  for (const id of tileIds) {
    const token = tilePartId(id);
    if (seen.has(token) || hiddenSet.has(token)) continue;
    const service = map[id];
    const flag = service?.config?.show_in_statusbar;
    if (hasDesign && flag !== undefined && !asBoolean(flag)) {
      hiddenSet.add(token);
      continue;
    }
    push(fallbackZone, token);
  }

  const hidden = [...hiddenSet].filter(
    token => !seen.has(token) && (validFixed.has(token) || knownTiles.has(token))
  );

  // Settings stays reachable: Status & menu is never hidden.
  if (!seen.has("status")) {
    zones[CLOCK_BAR_DEFAULT_ZONE[shape]].push("status");
  }

  // A deleted instance's id is dropped: hidden already only holds known tiles.
  const parts = resolvedParts(shape, stored);
  const dateZone = CLOCK_BAR_ZONE_KEYS[shape].find(key => zones[key].includes("date"));
  const timeZone = CLOCK_BAR_ZONE_KEYS[shape].find(key => zones[key].includes("time"));
  if (dateZone && dateZone === timeZone) {
    const list = zones[dateZone];
    const timeIndex = list.indexOf("time");
    const dateIndex = list.indexOf("date");
    const adjacent = dateIndex === timeIndex + 1;
    parts.date.underTime = shape === "vertical" ? true : Boolean(parts.date.underTime) && adjacent;
    parts.date.adjacentToTime = adjacent;
  } else {
    parts.date.underTime = shape === "vertical";
    parts.date.adjacentToTime = false;
  }
  parts.date.visible = Boolean(dateZone);
  parts.time.visible = Boolean(timeZone);

  return {
    shape,
    zones,
    hidden,
    parts,
    barHeight: stored.barHeight,
    paddingPx: sizePx(stored.barHeight, CLOCK_BAR_SIZE_TABLES[shape].padding),
    tileSize: stored.tileSize,
    tileSizePx: sizePx(stored.tileSize, CLOCK_BAR_SIZE_TABLES[shape].tile),
    tiles: tileIds.map(tilePartId),
    services: map,
    tileIds,
  };
}

/**
 * The only reader of `clockBarDesign`.
 *
 * @param {Object} config the household config (camelCase keys)
 * @param {Array} services plugin instances; those with a `statusbar_schema`
 *   become tile parts.
 */
export function resolveClockBarDesign(config, services) {
  const source = config || {};
  const rawDesign = source.clockBarDesign;
  const hasDesign = Boolean(rawDesign && typeof rawDesign === "object");
  const result = { version: CLOCK_BAR_DESIGN_VERSION };

  for (const shape of CLOCK_BAR_SHAPES) {
    const stored = hasDesign
      ? normalizeStoredShape(shape, rawDesign?.[shape]) ||
        deriveLegacyShape(shape, source, services)
      : deriveLegacyShape(shape, source, services);
    result[shape] = resolveShape(shape, stored, source, services, hasDesign);
  }
  return result;
}

/**
 * Serialize the editor's concrete state back to the stored shape.
 *
 * Consecutive tiles in instance order are compressed back to the `tiles`
 * placeholder, so a new plugin instance still lands where the old tiles sat.
 */
function compressZone(zone, tileOrder) {
  const tokens = zone.filter(token => isTilePart(token));
  if (!tokens.length) return [...zone];
  const first = zone.indexOf(tokens[0]);
  const last = zone.indexOf(tokens[tokens.length - 1]);
  const slice = zone.slice(first, last + 1);
  if (!slice.every(token => isTilePart(token))) return [...zone];
  const indexes = tokens.map(token => tileOrder.get(token));
  if (indexes.some(index => index === undefined)) return [...zone];
  const sorted = indexes.every((value, i) => i === 0 || indexes[i - 1] < value);
  if (!sorted) return [...zone];
  return [...zone.slice(0, first), CLOCK_BAR_TILES, ...zone.slice(last + 1)];
}

export function buildClockBarDesign(resolved) {
  const design = { version: CLOCK_BAR_DESIGN_VERSION };
  for (const shape of CLOCK_BAR_SHAPES) {
    const source = resolved?.[shape];
    if (!source) continue;
    const tileOrder = new Map((source.tileIds || []).map((id, index) => [tilePartId(id), index]));
    const zones = {};
    for (const key of CLOCK_BAR_ZONE_KEYS[shape]) {
      zones[key] = compressZone(source.zones?.[key] || [], tileOrder);
    }
    const parts = {};
    for (const partId of ["logo", "room", "time", "date"]) {
      const part = source.parts?.[partId] || {};
      const next = { size: part.size ?? "m" };
      if (partId === "time") {
        next.seconds = Boolean(part.seconds);
        if (shape === "vertical") next.style = part.style === "stacked" ? "stacked" : "upright";
      }
      if (partId === "date") {
        next.underTime = Boolean(part.underTime);
        if (shape === "vertical") next.style = part.style === "stacked" ? "stacked" : "line";
      }
      parts[partId] = next;
    }
    design[shape] = {
      zones,
      hidden: [...(source.hidden || [])],
      parts,
      barHeight: source.barHeight ?? "normal",
      tileSize: source.tileSize ?? "m",
    };
  }
  return design;
}

/** The design a fresh setup gets: date hidden, logo shown, tiles where they are. */
export function defaultClockBarDesign() {
  const resolved = resolveClockBarDesign({}, []);
  return buildClockBarDesign(resolved);
}

/** Remove one instance from a design's hidden shelf (Content › Clock bar info). */
export function showTileInDesign(design, instanceId) {
  if (!design || typeof design !== "object") return design;
  const token = tilePartId(instanceId);
  const next = JSON.parse(JSON.stringify(design));
  for (const shape of CLOCK_BAR_SHAPES) {
    const shapeDesign = next[shape];
    if (!shapeDesign?.hidden) continue;
    shapeDesign.hidden = shapeDesign.hidden.filter(entry => entry !== token);
  }
  return next;
}

export function partLabel(partId, services = []) {
  if (isTilePart(partId)) {
    const id = tileInstanceId(partId);
    const service = (services || []).find(item => item?.id === id);
    return service?.name || "Plugin tile";
  }
  return CLOCK_BAR_PART_LABELS[partId] || "Part";
}
