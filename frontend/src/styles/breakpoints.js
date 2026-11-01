/**
 * The breakpoint set (docs/design/frontend-doctrine.md §2): phone and wide,
 * nothing else. CSS uses the custom media names below (`@media (--bp-phone)`),
 * which the `customMedia` PostCSS plugin (./customMedia.js, wired in
 * vite.config.js) expands at build time; scripts import the widths and
 * queries from here. The fixedSets lint rejects any other width query.
 */

/** Widest phone layout: a phone is `width <= PHONE_MAX_WIDTH`. */
export const PHONE_MAX_WIDTH = 600;
/** Narrowest wide layout: wide is `width >= WIDE_MIN_WIDTH`. */
export const WIDE_MIN_WIDTH = 1024;

export const MEDIA = Object.freeze({
  phone: `(max-width: ${PHONE_MAX_WIDTH}px)`,
  wide: `(min-width: ${WIDE_MIN_WIDTH}px)`,
  /** Everything below wide (the complement of `wide`). */
  narrow: `(max-width: ${WIDE_MIN_WIDTH - 0.02}px)`,
});

/** Custom media names for `<style>` blocks, e.g. `@media (--bp-phone)`. */
export const CUSTOM_MEDIA = Object.freeze({
  "--bp-phone": MEDIA.phone,
  "--bp-wide": MEDIA.wide,
  "--bp-narrow": MEDIA.narrow,
});

export const isPhoneWidth = width => width <= PHONE_MAX_WIDTH;
export const isWideWidth = width => width >= WIDE_MIN_WIDTH;
