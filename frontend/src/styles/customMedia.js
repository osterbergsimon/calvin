/**
 * A tiny PostCSS plugin: expands the shared breakpoint names
 * (`@media (--bp-phone)`, see ./breakpoints.js) into their queries.
 * Native `@custom-media` is not supported by browsers yet, so the names are
 * resolved at build time. An unknown `--bp-*` name fails the build instead of
 * silently never matching.
 *
 * `--bp-phone` has an alternative that must not apply on the wall kiosk (the
 * short-landscape clause). A media query cannot see the kiosk class, so that
 * alternative becomes a second `@media` block, right after the first, whose
 * selectors are scoped to `:where(:root:not(.calvin-kiosk))` (zero added
 * specificity, so the cascade is the same as in the width block).
 */
import { CUSTOM_MEDIA, KIOSK_ROOT_CLASS } from "./breakpoints.js";

const NAME = /\((--[\w-]+)\)/g;
const NOT_KIOSK = `:not(.${KIOSK_ROOT_CLASS})`;

const alternativesOf = (name, media) => {
  if (!(name in media)) {
    throw new Error(`Unknown custom media ${name}; use one of ${Object.keys(media).join(", ")}`);
  }
  return media[name];
};

/**
 * Expand one media query (no top-level commas) into its variants: every
 * combination of the alternatives of the names it uses.
 */
function variantsOf(query, media) {
  let variants = [{ query, notOnKiosk: false }];
  for (const [token, name] of query.matchAll(NAME)) {
    const alternatives = alternativesOf(name, media);
    variants = variants.flatMap(variant =>
      alternatives.map(alt => ({
        query: variant.query.replace(token, alt.query),
        notOnKiosk: variant.notOnKiosk || Boolean(alt.notOnKiosk),
      }))
    );
  }
  return variants;
}

/** Split a media query list into `{ all, notOnKiosk }` query lists. */
export function splitCustomMedia(params, media = CUSTOM_MEDIA) {
  const all = [];
  const notOnKiosk = [];
  for (const query of params.split(",").map(part => part.trim())) {
    for (const variant of variantsOf(query, media)) {
      (variant.notOnKiosk ? notOnKiosk : all).push(variant.query);
    }
  }
  return { all: all.join(", "), notOnKiosk: notOnKiosk.join(", ") };
}

/** The part of a query list that applies everywhere, kiosk included. */
export function expandCustomMedia(params, media = CUSTOM_MEDIA) {
  return splitCustomMedia(params, media).all;
}

const ROOT_SELECTOR = /^(:root|html)(?![\w-])/;

function scopeOffKiosk(selector) {
  return ROOT_SELECTOR.test(selector)
    ? selector.replace(ROOT_SELECTOR, `$1:where(${NOT_KIOSK})`)
    : `:where(:root${NOT_KIOSK}) ${selector}`;
}

const insideKeyframes = rule => {
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === "atrule" && /keyframes$/i.test(node.name)) return true;
  }
  return false;
};

export default function customMedia(media = CUSTOM_MEDIA) {
  return {
    postcssPlugin: "calvin-custom-media",
    AtRule: {
      media(atRule) {
        if (!atRule.params.includes("(--")) return;
        const { all, notOnKiosk } = splitCustomMedia(atRule.params, media);
        if (notOnKiosk) {
          const offKiosk = atRule.clone({ params: notOnKiosk });
          offKiosk.walkRules(rule => {
            if (!insideKeyframes(rule)) rule.selectors = rule.selectors.map(scopeOffKiosk);
          });
          atRule.after(offKiosk);
        }
        if (all) atRule.params = all;
        else atRule.remove();
      },
    },
  };
}
customMedia.postcss = true;
