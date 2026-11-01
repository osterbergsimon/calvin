/**
 * A tiny PostCSS plugin: expands the shared breakpoint names
 * (`@media (--bp-phone)`, see ./breakpoints.js) into their width queries.
 * Native `@custom-media` is not supported by browsers yet, so the names are
 * resolved at build time. An unknown `--bp-*` name fails the build instead of
 * silently never matching.
 */
import { CUSTOM_MEDIA } from "./breakpoints.js";

const NAME = /\((--[\w-]+)\)/g;

export function expandCustomMedia(params, media = CUSTOM_MEDIA) {
  return params.replace(NAME, (match, name) => {
    if (!(name in media)) {
      throw new Error(`Unknown custom media ${name}; use one of ${Object.keys(media).join(", ")}`);
    }
    return media[name];
  });
}

export default function customMedia(media = CUSTOM_MEDIA) {
  return {
    postcssPlugin: "calvin-custom-media",
    AtRule: {
      media(atRule) {
        if (atRule.params.includes("(--")) atRule.params = expandCustomMedia(atRule.params, media);
      },
    },
  };
}
customMedia.postcss = true;
