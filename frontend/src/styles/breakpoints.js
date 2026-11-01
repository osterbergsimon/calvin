/**
 * The breakpoint set (docs/design/frontend-doctrine.md §2): phone and wide,
 * nothing else. CSS uses the custom media names below (`@media (--bp-phone)`),
 * which the `customMedia` PostCSS plugin (./customMedia.js, wired in
 * vite.config.js) expands at build time; scripts use `isPhone` / `isWideWidth`
 * from here. The fixedSets lint rejects any other width query.
 *
 * A phone is `width <= 600` OR a landscape screen `height <= 500` (a phone
 * turned sideways: 667x375, 640x360). The 800x480 wall kiosk is short and
 * landscape too, but it is not a phone: the height clause never applies on a
 * kiosk. The kiosk signal is the `KIOSK_ROOT_CLASS` class on <html>, set at
 * boot from the kiosk identity (?kiosk=, utils/kioskId.js); CSS and JS both
 * read that one class.
 *
 * The owner can also force a layout per screen (utils/layoutMode.js): the
 * `LAYOUT_*_CLASS` classes on <html> win over the viewport, in CSS and in JS.
 */

/** Widest phone layout: a phone is `width <= PHONE_MAX_WIDTH`, ... */
export const PHONE_MAX_WIDTH = 600;
/** ... or a landscape screen `height <= PHONE_MAX_HEIGHT` (never on a kiosk). */
export const PHONE_MAX_HEIGHT = 500;
/** Narrowest wide layout: wide is `width >= WIDE_MIN_WIDTH`. */
export const WIDE_MIN_WIDTH = 1024;

/** On <html> when this browser is a registered kiosk (opened with ?kiosk=). */
export const KIOSK_ROOT_CLASS = "calvin-kiosk";
/** On <html> when this screen forces the desktop layout (utils/layoutMode.js). */
export const LAYOUT_DESKTOP_CLASS = "calvin-layout-desktop";
/** On <html> when this screen forces the phone layout. */
export const LAYOUT_PHONE_CLASS = "calvin-layout-phone";

const PHONE_WIDTH = `(max-width: ${PHONE_MAX_WIDTH}px)`;
const PHONE_LANDSCAPE = `(max-height: ${PHONE_MAX_HEIGHT}px) and (orientation: landscape)`;
// A media query that always matches, for rules that a class turns on instead
// of the viewport (the forced phone layout).
const ANY_SIZE = "(min-width: 0px)";

export const MEDIA = Object.freeze({
  /**
   * The full phone query, kiosk exemption and forced layout NOT included (a
   * media query cannot see a class). In JS call `isPhone()`; in CSS write
   * `(--bp-phone)`.
   */
  phone: `${PHONE_WIDTH}, ${PHONE_LANDSCAPE}`,
  phoneWidth: PHONE_WIDTH,
  phoneLandscape: PHONE_LANDSCAPE,
  wide: `(min-width: ${WIDE_MIN_WIDTH}px)`,
});

/**
 * Custom media names for `<style>` blocks, e.g. `@media (--bp-phone)`. Each
 * name is a list of alternatives, and each alternative can carry a root-class
 * condition (a media query cannot see a class, so the expansion scopes the
 * rules instead):
 *  - `notOnKiosk`: never on the wall kiosk (`:not(.calvin-kiosk)`)
 *  - `unlessLayout`: not when that layout is forced (`:not(.calvin-layout-*)`)
 *  - `onlyWhenLayout`: only when that layout is forced (`.calvin-layout-*`)
 */
export const CUSTOM_MEDIA = Object.freeze({
  "--bp-phone": Object.freeze([
    { query: PHONE_WIDTH, unlessLayout: LAYOUT_DESKTOP_CLASS },
    {
      query: PHONE_LANDSCAPE,
      notOnKiosk: true,
      unlessLayout: LAYOUT_DESKTOP_CLASS,
    },
    // Forced phone: every size, kiosk included.
    { query: ANY_SIZE, onlyWhenLayout: LAYOUT_PHONE_CLASS },
  ]),
  "--bp-wide": Object.freeze([{ query: MEDIA.wide }]),
});

/** True when <html> carries the kiosk class (see utils/kioskId.js). */
export const isKioskRoot = () =>
  typeof document !== "undefined" &&
  Boolean(document.documentElement?.classList.contains(KIOSK_ROOT_CLASS));

/**
 * The layout this screen forces: "desktop", "phone", or "auto" (none). The
 * class is the single source of truth shared with the CSS expansion above
 * (see utils/layoutMode.js).
 */
export const getLayoutOverride = () => {
  if (typeof document === "undefined") return "auto";
  const classes = document.documentElement?.classList;
  if (classes?.contains(LAYOUT_DESKTOP_CLASS)) return "desktop";
  if (classes?.contains(LAYOUT_PHONE_CLASS)) return "phone";
  return "auto";
};

const isPhoneWidthViewport = width => width <= PHONE_MAX_WIDTH;

/** Width alone (an editor pane, a container), unless a layout is forced. */
export const isPhoneWidth = width => {
  const layout = getLayoutOverride();
  return layout === "phone" || (layout !== "desktop" && isPhoneWidthViewport(width));
};
export const isWideWidth = width => width >= WIDE_MIN_WIDTH;

/**
 * The viewport is a phone: narrow, or a short landscape screen that is not a
 * kiosk. A forced layout wins over both.
 */
export const isPhone = (
  width,
  height,
  { kiosk = isKioskRoot(), layout = getLayoutOverride() } = {}
) => {
  if (layout === "desktop") return false;
  if (layout === "phone") return true;
  return isPhoneWidthViewport(width) || (!kiosk && height <= PHONE_MAX_HEIGHT && width > height);
};
