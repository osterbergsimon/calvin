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
 */

/** Widest phone layout: a phone is `width <= PHONE_MAX_WIDTH`, ... */
export const PHONE_MAX_WIDTH = 600;
/** ... or a landscape screen `height <= PHONE_MAX_HEIGHT` (never on a kiosk). */
export const PHONE_MAX_HEIGHT = 500;
/** Narrowest wide layout: wide is `width >= WIDE_MIN_WIDTH`. */
export const WIDE_MIN_WIDTH = 1024;

/** On <html> when this browser is a registered kiosk (opened with ?kiosk=). */
export const KIOSK_ROOT_CLASS = "calvin-kiosk";

const PHONE_WIDTH = `(max-width: ${PHONE_MAX_WIDTH}px)`;
const PHONE_LANDSCAPE = `(max-height: ${PHONE_MAX_HEIGHT}px) and (orientation: landscape)`;

export const MEDIA = Object.freeze({
  /**
   * The full phone query, kiosk exemption NOT included (a media query cannot
   * see a class). In JS call `isPhone()`; in CSS write `(--bp-phone)`.
   */
  phone: `${PHONE_WIDTH}, ${PHONE_LANDSCAPE}`,
  phoneWidth: PHONE_WIDTH,
  phoneLandscape: PHONE_LANDSCAPE,
  wide: `(min-width: ${WIDE_MIN_WIDTH}px)`,
});

/**
 * Custom media names for `<style>` blocks, e.g. `@media (--bp-phone)`. Each
 * name is a list of alternatives; an alternative marked `notOnKiosk` is
 * emitted with its rules scoped to `:root:not(.calvin-kiosk)`.
 */
export const CUSTOM_MEDIA = Object.freeze({
  "--bp-phone": Object.freeze([
    { query: PHONE_WIDTH },
    { query: PHONE_LANDSCAPE, notOnKiosk: true },
  ]),
  "--bp-wide": Object.freeze([{ query: MEDIA.wide }]),
});

/** True when <html> carries the kiosk class (see utils/kioskId.js). */
export const isKioskRoot = () =>
  typeof document !== "undefined" &&
  Boolean(document.documentElement?.classList.contains(KIOSK_ROOT_CLASS));

/** Width alone (an editor pane, a container): `width <= PHONE_MAX_WIDTH`. */
export const isPhoneWidth = width => width <= PHONE_MAX_WIDTH;
export const isWideWidth = width => width >= WIDE_MIN_WIDTH;

/** The viewport is a phone: narrow, or a short landscape screen that is not a kiosk. */
export const isPhone = (width, height, { kiosk = isKioskRoot() } = {}) =>
  isPhoneWidth(width) || (!kiosk && height <= PHONE_MAX_HEIGHT && width > height);
