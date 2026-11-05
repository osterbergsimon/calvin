/**
 * Clock bar design (§4 of docs/design/2026-11-04-clock-bar-editor.md).
 *
 * One resolver is the only reader of the design. The bar components and the
 * editor all call it; it fills defaults, drops unknown/deleted ids, guarantees
 * Status & menu stays reachable, and — when `clockBarDesign` is absent — derives
 * the same design the old clock-bar keys render today.
 */

export const CLOCK_BAR_DESIGN_VERSION = 1;
export const CLOCK_BAR_TILES = "tiles";

export const CLOCK_BAR_PART_IDS = ["logo", "room", "pageDots", "time", "date", "status"];
export const CLOCK_BAR_SIZE_STEPS = ["s", "m", "l", "xl"];
export const CLOCK_BAR_SHAPE_ZONES = {
  horizontal: ["left", "center", "right"],
  vertical: ["top", "middle", "bottom"],
};
export const CLOCK_BAR_DEFAULT_STATUS_ZONE = {
  horizontal: "right",
  vertical: "bottom",
};

export const CLOCK_BAR_BAR_HEIGHTS = ["slim", "normal", "roomy"];

// Builder choice (§8): one step table per shape. "m" equals today's default on
// both bars, so a default setup renders pixel-identical until someone edits it.
// Logo/room "m" is rendered with the existing CSS token (see partFontSize), so
// their values here are only for the editor's Custom readout and tests.
export const CLOCK_BAR_SIZE_TABLE = {
  horizontal: {
    time: { s: 14, m: 16, l: 24, xl: 32 },
    date: { s: 12, m: 14, l: 18, xl: 22 },
    logo: { s: 13, m: 16, l: 20, xl: 24 },
    room: { s: 12, m: 14.4, l: 18, xl: 22 },
    tile: { s: 14, m: 16, l: 20, xl: 24 },
  },
  vertical: {
    time: { s: 14, m: 18, l: 28, xl: 36 },
    date: { s: 10, m: 11, l: 14, xl: 18 },
    logo: { s: 13, m: 16, l: 20, xl: 24 },
    room: { s: 12, m: 14.4, l: 18, xl: 22 },
    tile: { s: 14, m: 16, l: 20, xl: 24 },
  },
};

export const CLOCK_BAR_BAR_HEIGHT_TABLE = {
  horizontal: { slim: 4, normal: 8, roomy: 12 },
  vertical: { slim: 4, normal: 8, roomy: 12 },
};

export const CLOCK_BAR_SIZE_OPTIONS = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
];

export const CLOCK_BAR_BAR_HEIGHT_OPTIONS = [
  { value: "slim", label: "Slim" },
  { value: "normal", label: "Normal" },
  { value: "roomy", label: "Roomy" },
];

const DEFAULT_PARTS = {
  logo: { size: "m" },
  room: { size: "m" },
  pageDots: {},
  time: { size: "m", seconds: false, style: "upright" },
  date: { size: "m", underTime: false, style: "line" },
  status: {},
};

const clone = value => JSON.parse(JSON.stringify(value));

const read = (object, camel, snake) => object?.[camel] ?? object?.[snake];

const asBoolean = value => {
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
};

const serviceTiles = services =>
  (Array.isArray(services) ? services : [])
    .filter(service => service?.statusbar_schema?.kind && service?.id)
    .map(service => ({
      id: `tile:${service.id}`,
      instanceId: service.id,
      name: service.name || service.id,
      visible: !("show_in_statusbar" in (service.config || {}))
        ? true
        : asBoolean(service.config.show_in_statusbar),
    }));

const stepForPx = (px, part, shape) => {
  const table = CLOCK_BAR_SIZE_TABLE[shape]?.[part] || {};
  const match = Object.entries(table).find(([, value]) => value === Number(px));
  return match ? match[0] : null;
};

const stepForBarHeight = (px, shape) => {
  const table = CLOCK_BAR_BAR_HEIGHT_TABLE[shape] || {};
  const match = Object.entries(table).find(([, value]) => value === Number(px));
  return match ? match[0] : null;
};

/** A size is a step name or a Custom px number (8–96). */
const normalizeSize = (value, fallback = "m") => {
  if (typeof value === "string" && CLOCK_BAR_SIZE_STEPS.includes(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(96, Math.max(8, Math.round(value)));
  }
  return fallback;
};

const normalizeBarHeight = value => {
  if (CLOCK_BAR_BAR_HEIGHTS.includes(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(96, Math.max(0, Math.round(value)));
  }
  return "normal";
};

const normalizePart = (id, part) => {
  const base = { ...(DEFAULT_PARTS[id] || {}) };
  if (!part || typeof part !== "object") return base;
  if ("size" in base) base.size = normalizeSize(part.size, base.size);
  if ("seconds" in base) base.seconds = asBoolean(part.seconds);
  if ("underTime" in base) base.underTime = asBoolean(part.underTime);
  if ("style" in base) {
    const allowed = id === "time" ? ["upright", "stacked"] : ["line", "stacked"];
    base.style = allowed.includes(part.style) ? part.style : base.style;
  }
  return base;
};

const normalizeParts = (shape, parts) => {
  const normalized = {};
  for (const id of CLOCK_BAR_PART_IDS) {
    if (id === "status" || id === "pageDots") {
      normalized[id] = {};
      continue;
    }
    normalized[id] = normalizePart(id, parts?.[id]);
  }
  if (shape === "vertical") normalized.date.underTime = true;
  return normalized;
};

const sanitizeList = (list, { knownTiles, keepTileIds }) =>
  (Array.isArray(list) ? list : []).filter(id => {
    if (typeof id !== "string") return false;
    if (id === CLOCK_BAR_TILES) return true;
    if (CLOCK_BAR_PART_IDS.includes(id)) return true;
    if (id.startsWith("tile:")) return keepTileIds ? knownTiles.has(id) : true;
    return false;
  });

const deriveFromOldKeys = (config, tiles) => {
  const showDate = asBoolean(read(config, "clockShowDate", "clock_show_date"));
  const showSeconds = asBoolean(read(config, "clockShowSeconds", "clock_show_seconds"));
  const showLogo = read(config, "clockBarShowLogo", "clock_bar_show_logo") !== false;

  const horizontalLayout = read(config, "clockBarLayout", "clock_bar_layout") || "single-line";
  const verticalLayout =
    read(config, "clockBarVerticalLayout", "clock_bar_vertical_layout") || "upright";

  const horizontal = {
    zones: {
      left: [showLogo ? "logo" : null, "room", "pageDots"].filter(Boolean),
      center: ["time", ...(showDate ? ["date"] : [])],
      right: [CLOCK_BAR_TILES, "status"],
    },
    hidden: [
      ...(showDate ? [] : ["date"]),
      ...(showLogo ? [] : ["logo"]),
      ...tiles.filter(tile => !tile.visible).map(tile => tile.id),
    ],
    parts: {
      logo: { size: "m" },
      room: { size: "m" },
      time: {
        size:
          stepForPx(
            read(config, "clockBarFontSize", "clock_bar_font_size") ?? 16,
            "time",
            "horizontal"
          ) ?? normalizeSize(read(config, "clockBarFontSize", "clock_bar_font_size") ?? 16),
        seconds: showSeconds,
        style: "upright",
      },
      date: {
        size:
          stepForPx(
            read(config, "clockBarDateFontSize", "clock_bar_date_font_size") ?? 14,
            "date",
            "horizontal"
          ) ??
          normalizeSize(read(config, "clockBarDateFontSize", "clock_bar_date_font_size") ?? 14),
        underTime: horizontalLayout === "two-lines",
        style: "line",
      },
    },
    barHeight:
      stepForBarHeight(read(config, "clockBarPadding", "clock_bar_padding") ?? 8, "horizontal") ??
      normalizeBarHeight(read(config, "clockBarPadding", "clock_bar_padding") ?? 8),
    tileSize:
      stepForPx(
        read(config, "clockBarPluginItemSize", "clock_bar_plugin_item_size") ?? 16,
        "tile",
        "horizontal"
      ) ??
      normalizeSize(read(config, "clockBarPluginItemSize", "clock_bar_plugin_item_size") ?? 16),
  };

  const stacked = ["compact-time", "compact-time-date", "vertical-compact"].includes(
    verticalLayout
  );
  const stackedDate = verticalLayout === "compact-time-date";
  const vertical = {
    zones: {
      top: [showLogo ? "logo" : null, "pageDots"].filter(Boolean),
      middle: ["time", ...(showDate ? ["date"] : [])],
      bottom: [CLOCK_BAR_TILES, "status"],
    },
    hidden: [
      "room",
      ...(showDate ? [] : ["date"]),
      ...(showLogo ? [] : ["logo"]),
      ...tiles.filter(tile => !tile.visible).map(tile => tile.id),
    ],
    parts: {
      logo: { size: "m" },
      room: { size: "m" },
      time: {
        size:
          stepForPx(
            read(config, "clockBarVerticalFontSize", "clock_bar_vertical_font_size") ?? 18,
            "time",
            "vertical"
          ) ??
          normalizeSize(
            read(config, "clockBarVerticalFontSize", "clock_bar_vertical_font_size") ?? 18
          ),
        seconds: showSeconds,
        style: stacked ? "stacked" : "upright",
      },
      date: {
        size:
          stepForPx(
            read(config, "clockBarVerticalDateFontSize", "clock_bar_vertical_date_font_size") ?? 11,
            "date",
            "vertical"
          ) ??
          normalizeSize(
            read(config, "clockBarVerticalDateFontSize", "clock_bar_vertical_date_font_size") ?? 11
          ),
        underTime: true,
        style: stackedDate ? "stacked" : "line",
      },
    },
    barHeight:
      stepForBarHeight(
        read(config, "clockBarVerticalPadding", "clock_bar_vertical_padding") ?? 8,
        "vertical"
      ) ??
      normalizeBarHeight(
        read(config, "clockBarVerticalPadding", "clock_bar_vertical_padding") ?? 8
      ),
    tileSize:
      stepForPx(
        read(config, "clockBarVerticalPluginItemSize", "clock_bar_vertical_plugin_item_size") ?? 16,
        "tile",
        "vertical"
      ) ??
      normalizeSize(
        read(config, "clockBarVerticalPluginItemSize", "clock_bar_vertical_plugin_item_size") ?? 16
      ),
  };

  return {
    version: CLOCK_BAR_DESIGN_VERSION,
    horizontal,
    vertical,
    tileIds: tiles.map(tile => tile.id),
  };
};

const hasPlaceholder = (shape, zones) =>
  CLOCK_BAR_SHAPE_ZONES[shape].some(zone => zones?.[zone]?.includes(CLOCK_BAR_TILES));

const sanitizeShape = (shape, rawShape, tiles) => {
  const zones = {};
  for (const zone of CLOCK_BAR_SHAPE_ZONES[shape]) {
    zones[zone] = sanitizeList(rawShape?.zones?.[zone], {
      knownTiles: new Set(tiles.map(tile => tile.id)),
      keepTileIds: tiles.length > 0,
    });
  }
  const hidden = sanitizeList(rawShape?.hidden, {
    knownTiles: new Set(tiles.map(tile => tile.id)),
    keepTileIds: tiles.length > 0,
  });

  return {
    zones,
    hidden,
    parts: normalizeParts(shape, rawShape?.parts),
    barHeight: normalizeBarHeight(rawShape?.barHeight),
    tileSize: normalizeSize(rawShape?.tileSize, "m"),
  };
};

const uniqueInPlace = state => {
  // A part lives in at most one place; the first zone wins, then hidden.
  const seen = new Set();
  for (const zone of CLOCK_BAR_SHAPE_ZONES[state.shape]) {
    state.zones[zone] = state.zones[zone].filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  state.hidden = state.hidden.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const ensureStatus = (shape, zones, hidden) => {
  const place = CLOCK_BAR_DEFAULT_STATUS_ZONE[shape];
  const inZone = CLOCK_BAR_SHAPE_ZONES[shape].some(zone => zones[zone].includes("status"));
  const nextHidden = hidden.filter(id => id !== "status");
  if (!inZone) zones[place] = [...zones[place], "status"];
  return nextHidden;
};

const ensureTileDefaults = (shape, zones, hidden, tiles) => {
  if (!tiles.length) return hidden;
  const explicit = new Set([
    ...CLOCK_BAR_SHAPE_ZONES[shape].flatMap(zone => zones[zone]),
    ...hidden,
  ]);
  const placeholder = hasPlaceholder(shape, zones);
  const next = [...hidden];
  for (const tile of tiles) {
    if (explicit.has(tile.id)) continue;
    // Once a tile is listed (or kept on the shelf) the design wins. An
    // unlisted instance follows its own default: visible only where the tiles
    // placeholder is, so it can never silently disappear.
    if (!tile.visible || !placeholder) next.push(tile.id);
  }
  return next;
};

/** The design the old keys render today. */
export function deriveClockBarDesign(config = {}, services = []) {
  return deriveFromOldKeys(config, serviceTiles(services));
}

/** The one resolver: stored design → safe, complete design. */
export function resolveClockBarDesign(config = {}, services = []) {
  const tiles = serviceTiles(services);
  const stored = read(config, "clockBarDesign", "clock_bar_design");

  if (!stored || typeof stored !== "object") {
    return deriveFromOldKeys(config, tiles);
  }

  const horizontal = sanitizeShape("horizontal", stored.horizontal, tiles);
  const vertical = sanitizeShape("vertical", stored.vertical, tiles);

  for (const [shape, state] of [
    ["horizontal", horizontal],
    ["vertical", vertical],
  ]) {
    uniqueInPlace({ shape, zones: state.zones, hidden: state.hidden });
    state.hidden = ensureStatus(shape, state.zones, state.hidden);
    state.hidden = ensureTileDefaults(shape, state.zones, state.hidden, tiles);
    uniqueInPlace({ shape, zones: state.zones, hidden: state.hidden });
  }

  return {
    version: CLOCK_BAR_DESIGN_VERSION,
    horizontal,
    vertical,
    tileIds: tiles.map(tile => tile.id),
  };
}

/** Everything the editor writes: never the resolver's runtime metadata. */
export function toStoredClockBarDesign(design) {
  return {
    version: CLOCK_BAR_DESIGN_VERSION,
    horizontal: clone(design.horizontal),
    vertical: clone(design.vertical),
  };
}

/** The tile ids an `tiles` placeholder stands for, in instance order. */
export function unplacedClockBarTiles(design, shape) {
  const state = design[shape];
  const explicit = new Set([
    ...CLOCK_BAR_SHAPE_ZONES[shape].flatMap(zone => state.zones?.[zone] || []),
    ...(state.hidden || []),
  ]);
  return (design.tileIds || []).filter(id => !explicit.has(id));
}

/** The real parts in a zone, with the tiles placeholder expanded. */
export function expandClockBarZone(design, shape, zone) {
  const ids = design[shape]?.zones?.[zone] || [];
  const unplaced = unplacedClockBarTiles(design, shape);
  return ids.flatMap(id => (id === CLOCK_BAR_TILES ? unplaced : [id]));
}

/**
 * The zone as render groups: adjacent Time+Date become one stack when Date's
 * Under the time is on; everything else is a single part.
 */
export function groupClockBarZone(design, shape, zone) {
  const ids = expandClockBarZone(design, shape, zone);
  const underTime = design[shape]?.parts?.date?.underTime === true;
  const groups = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id === "time" && underTime && ids[index + 1] === "date") {
      groups.push({ kind: "stack", parts: ["time", "date"] });
      index += 1;
    } else {
      groups.push({ kind: "part", id });
    }
  }
  return groups;
}

/** The px a part's size resolves to (Custom numbers pass through). */
export function clockBarPartSizePx(design, shape, part) {
  const state = design[shape];
  const size = part.startsWith("tile:") ? state?.tileSize : state?.parts?.[part]?.size;
  if (typeof size === "number") return size;
  const tablePart = part.startsWith("tile:") ? "tile" : part;
  return (
    CLOCK_BAR_SIZE_TABLE[shape]?.[tablePart]?.[size] ??
    CLOCK_BAR_SIZE_TABLE[shape]?.[tablePart]?.m ??
    16
  );
}

/** The px padding a bar height resolves to. */
export function clockBarBarHeightPx(design, shape) {
  const height = design[shape]?.barHeight;
  if (typeof height === "number") return height;
  return CLOCK_BAR_BAR_HEIGHT_TABLE[shape]?.[height] ?? 8;
}

/** A stored px value's step name, or null when it is Custom. */
export function clockBarSizeStep(value, part, shape) {
  return stepForPx(value, part, shape);
}
