/**
 * Letter layers for the on-screen keyboard.
 * Spec: docs/design/2026-10-29-on-screen-keyboard.md §4 "Keyboard layouts".
 *
 * The keyboard LAYOUT is independent of Calvin's UI language. Nothing here
 * reads, follows or changes the language the UI is shown in, and changing the
 * UI language never changes the layout. The only language-ish input is the
 * one-time, per-device `navigator.language` hint used while nobody has picked
 * a layout yet.
 *
 * Only the letter layer (and its Shift capitals) changes with the layout; the
 * symbols, accents and numeric layers are shared by every layout.
 */

export const DEFAULT_OSK_LAYOUT = "en";
export const OSK_LAYOUT_STORAGE_KEY = "calvin-osk-layout";
export const OSK_LAYOUT_HINT_STORAGE_KEY = "calvin-osk-layout-hint";

const SV_ROWS = [
  "q w e r t y u i o p å {bksp}",
  "a s d f g h j k l ö ä {enter}",
  "{shift} z x c v b n m , . - {shift}",
];

export const OSK_LAYOUTS_BY_ID = {
  en: {
    name: "English",
    code: "EN",
    rows: [
      "q w e r t y u i o p {bksp}",
      "a s d f g h j k l {enter}",
      "{shift} z x c v b n m , . {shift}",
    ],
  },
  sv: { name: "Svenska", code: "SV", rows: SV_ROWS },
  fi: { name: "Suomi", code: "FI", rows: SV_ROWS },
  no: {
    name: "Norsk",
    code: "NO",
    rows: [
      "q w e r t y u i o p å {bksp}",
      "a s d f g h j k l ø æ {enter}",
      "{shift} z x c v b n m , . - {shift}",
    ],
  },
  da: {
    name: "Dansk",
    code: "DA",
    rows: [
      "q w e r t y u i o p å {bksp}",
      "a s d f g h j k l æ ø {enter}",
      "{shift} z x c v b n m , . - {shift}",
    ],
  },
  de: {
    name: "Deutsch",
    code: "DE",
    rows: [
      "q w e r t z u i o p ü {bksp}",
      "a s d f g h j k l ö ä {enter}",
      "{shift} y x c v b n m , . ß {shift}",
    ],
  },
  fr: {
    name: "Français",
    code: "FR",
    rows: [
      "a z e r t y u i o p {bksp}",
      "q s d f g h j k l m {enter}",
      "{shift} w x c v b n é è ç à {shift}",
    ],
  },
};

/** Option order of the layouts (Device › Keyboard, K7). */
export const OSK_LAYOUT_IDS = ["en", "sv", "fi", "no", "da", "de", "fr"];

const URL_BOTTOM_ROW = "{numbers} / : {space} . .com {hide}";
const EMAIL_BOTTOM_ROW = "{numbers} @ {space} . .com {hide}";

/**
 * The third row of the url/email keyboards: the active layout's row-3 letters
 * (a–z only, accented letters and punctuation dropped) followed by "- _",
 * because hyphens and underscores are common in addresses (spec §4).
 */
const urlThirdRow = row => {
  const letters = row.split(" ").filter(key => /^[a-z]$/.test(key));
  return ["{shift}", ...letters, "-", "_", "{shift}"].join(" ");
};

// The symbols, accents and numeric layers are the same for every layout.
const SHARED_LAYERS = {
  symbols: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "@ # $ % & * - + ( ) {enter}",
    "{abc} ! \" ' : ; / ? _ = {abc}",
    "{abc} {space} . , {hide}",
  ],
  accents: [
    "å ä ö æ ø é è ü ñ ß {bksp}",
    "á à â ê ë í ï ó ô ú {enter}",
    "{shift} ç õ œ ã ' ` ~ ^ ¨ {shift}",
    "{abc} {space} . , {hide}",
  ],
  numeric: ["1 2 3 {bksp}", "4 5 6 -", "7 8 9 .", "{hide} 0 , {enter}"],
};

export const isOskLayoutId = value =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(OSK_LAYOUTS_BY_ID, value);

const layoutOrDefault = value => (isOskLayoutId(value) ? value : DEFAULT_OSK_LAYOUT);

export const oskLayoutName = value => OSK_LAYOUTS_BY_ID[layoutOrDefault(value)].name;
export const oskLayoutCode = value => OSK_LAYOUTS_BY_ID[layoutOrDefault(value)].code;

/** SelectPill options: every layout named in its own language, never translated. */
export const oskLayoutOptions = () =>
  OSK_LAYOUT_IDS.map(id => ({ value: id, label: OSK_LAYOUTS_BY_ID[id].name }));

/**
 * The bottom row of the letter layer. `en` keeps its "-" and `fr` its ", ."
 * around the space bar; every layout gains `{layout}` while extra layouts are
 * set.
 */
const bottomRow = (layout, showLayoutKey) => {
  const keys = ["{numbers}"];
  if (showLayoutKey) keys.push("{layout}");
  keys.push("{accents}");
  if (layout === "fr") keys.push(",");
  keys.push("{space}");
  if (layout === "fr") keys.push(".");
  if (layout === "en") keys.push("-");
  keys.push("{hide}");
  return keys.join(" ");
};

/**
 * The simple-keyboard layout object for the active letter layout.
 * URL and email fields keep the active layout's first two rows unchanged,
 * replace the third row with its a–z letters plus "- _", and use their own
 * bottom row (spec §4).
 */
export const buildOskLayouts = ({ layout, showLayoutKey = false } = {}) => {
  const id = layoutOrDefault(layout);
  const rows = OSK_LAYOUTS_BY_ID[id].rows;
  const addressRows = [rows[0], rows[1], urlThirdRow(rows[2])];
  return {
    default: [...rows, bottomRow(id, showLayoutKey)],
    url: [...addressRows, URL_BOTTOM_ROW],
    email: [...addressRows, EMAIL_BOTTOM_ROW],
    ...SHARED_LAYERS,
  };
};

/**
 * Map a BCP 47 language tag to a layout. This is only ever used for the
 * one-time hint when no layout has been picked; it never follows Calvin's UI.
 */
export const layoutFromLanguageTag = value => {
  const tag = String(value ?? "").toLowerCase();
  if (tag.startsWith("sv")) return "sv";
  if (tag.startsWith("fi")) return "fi";
  if (/^(nb|nn)([-_]|$)/.test(tag) || /^no([-_]|$)/.test(tag)) return "no";
  if (tag.startsWith("da")) return "da";
  if (tag.startsWith("de")) return "de";
  if (tag.startsWith("fr")) return "fr";
  return DEFAULT_OSK_LAYOUT;
};

const safeStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readStored = key => {
  try {
    return safeStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeStored = (key, value) => {
  try {
    safeStorage()?.setItem(key, value);
  } catch {
    // Private mode or a blocked storage partition: the layout still works,
    // it just isn't remembered on this device.
  }
};

/** The layout the keyboard last used on this device. */
export const readStoredOskLayout = () => {
  const value = readStored(OSK_LAYOUT_STORAGE_KEY);
  return isOskLayoutId(value) ? value : null;
};

export const storeOskLayout = value => {
  if (isOskLayoutId(value)) writeStored(OSK_LAYOUT_STORAGE_KEY, value);
};

/**
 * The one-time browser hint: read the cached answer, or derive it from the
 * language tag once and cache it, so it never changes later on this device.
 */
export const readOskLayoutHint = languageTag => {
  const cached = readStored(OSK_LAYOUT_HINT_STORAGE_KEY);
  if (isOskLayoutId(cached)) return cached;
  const hint = layoutFromLanguageTag(
    languageTag ?? (typeof navigator !== "undefined" ? navigator.language : "")
  );
  writeStored(OSK_LAYOUT_HINT_STORAGE_KEY, hint);
  return hint;
};

/**
 * The main layout: the one saved in Settings, else the device hint. Calvin's
 * UI language is never an input here.
 */
export const resolveOskMainLayout = (configured, languageTag) =>
  isOskLayoutId(configured) ? configured : readOskLayoutHint(languageTag);

/** Config parsing: an unknown or missing layout stays unset. */
export const normalizeOskLayout = value => (isOskLayoutId(value) ? value : null);

/** Config parsing: keep known layouts, in the saved order, minus the main one. */
export const normalizeOskExtraLayouts = (value, mainLayout = null) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const extras = [];
  for (const id of value) {
    if (!isOskLayoutId(id) || id === mainLayout || seen.has(id)) continue;
    seen.add(id);
    extras.push(id);
  }
  return extras;
};

/** Switching order: the main layout first, then the extras in list order. */
export const layoutSwitchOrder = (mainLayout, extraLayouts = []) => {
  const order = [];
  for (const id of [mainLayout, ...(Array.isArray(extraLayouts) ? extraLayouts : [])]) {
    if (isOskLayoutId(id) && !order.includes(id)) order.push(id);
  }
  return order;
};

/** Next layout in `order`, wrapping back to the main one. */
export const nextOskLayout = (order, active) => {
  const list = Array.isArray(order) ? order : [];
  if (!list.length) return DEFAULT_OSK_LAYOUT;
  const index = list.indexOf(active);
  return index < 0 ? list[0] : list[(index + 1) % list.length];
};
