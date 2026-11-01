/**
 * A tiny PostCSS plugin: expands the shared breakpoint names
 * (`@media (--bp-phone)`, see ./breakpoints.js) into their queries.
 * Native `@custom-media` is not supported by browsers yet, so the names are
 * resolved at build time. An unknown `--bp-*` name fails the build instead of
 * silently never matching.
 *
 * Some alternatives depend on a class on <html>, which a media query cannot
 * see: `notOnKiosk`, `unlessLayout` and `onlyWhenLayout` on an alternative
 * (breakpoints.js). Those alternatives become separate `@media` blocks, right
 * after the plain one, whose selectors are scoped to `:where(:root…)`
 * (zero added specificity, so the cascade is the same as in the width block):
 *  - `:root:not(.calvin-kiosk)` for the short-landscape clause, and
 *  - `:root:not(.calvin-layout-desktop)` / `:root.calvin-layout-phone` for a
 *    layout the owner forced (utils/layoutMode.js).
 */
import { CUSTOM_MEDIA, KIOSK_ROOT_CLASS } from "./breakpoints.js";

const NAME = /\((--[\w-]+)\)/g;

const alternativesOf = (name, media) => {
  if (!(name in media)) {
    throw new Error(`Unknown custom media ${name}; use one of ${Object.keys(media).join(", ")}`);
  }
  return media[name];
};

/** The root-class selectors an alternative requires, e.g. `:not(.calvin-kiosk)`. */
const scopesOf = alternative => [
  ...(alternative.notOnKiosk ? [`:not(.${KIOSK_ROOT_CLASS})`] : []),
  ...(alternative.unlessLayout ? [`:not(.${alternative.unlessLayout})`] : []),
  ...(alternative.onlyWhenLayout ? [`.${alternative.onlyWhenLayout}`] : []),
];

/**
 * Expand one media query (no top-level commas) into its variants: every
 * combination of the alternatives of the names it uses.
 */
function variantsOf(query, media) {
  let variants = [{ query, scopes: [] }];
  for (const [token, name] of query.matchAll(NAME)) {
    const alternatives = alternativesOf(name, media);
    variants = variants.flatMap(variant =>
      alternatives.map(alternative => ({
        query: variant.query.replace(token, alternative.query),
        scopes: [...variant.scopes, ...scopesOf(alternative)],
      }))
    );
  }
  return variants;
}

/**
 * Split a media query list into the part that applies everywhere (`all`) and
 * the class-scoped parts, grouped by scope so one `@media` block per scope is
 * emitted.
 */
export function splitCustomMedia(params, media = CUSTOM_MEDIA) {
  const all = [];
  const scoped = new Map();
  for (const query of params.split(",").map(part => part.trim())) {
    for (const variant of variantsOf(query, media)) {
      if (variant.scopes.length === 0) {
        all.push(variant.query);
        continue;
      }
      const scope = variant.scopes.join("");
      if (!scoped.has(scope)) scoped.set(scope, { scope, queries: [] });
      scoped.get(scope).queries.push(variant.query);
    }
  }
  return {
    all: all.join(", "),
    scoped: [...scoped.values()].map(({ scope, queries }) => ({
      scope,
      queries: queries.join(", "),
    })),
  };
}

/** The part of a query list that applies everywhere, kiosk and layout included. */
export function expandCustomMedia(params, media = CUSTOM_MEDIA) {
  return splitCustomMedia(params, media).all;
}

const ROOT_SELECTOR = /^(:root|html)(?![\w-])/;

function scopeToRoot(selector, scope) {
  return ROOT_SELECTOR.test(selector)
    ? selector.replace(ROOT_SELECTOR, `$1:where(${scope})`)
    : `:where(:root${scope}) ${selector}`;
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
        const { all, scoped } = splitCustomMedia(atRule.params, media);
        let cursor = atRule;
        for (const { scope, queries } of scoped) {
          const block = atRule.clone({ params: queries });
          block.walkRules(rule => {
            if (!insideKeyframes(rule)) {
              rule.selectors = rule.selectors.map(selector => scopeToRoot(selector, scope));
            }
          });
          cursor.after(block);
          cursor = block;
        }
        if (all) atRule.params = all;
        else atRule.remove();
      },
    },
  };
}
customMedia.postcss = true;
