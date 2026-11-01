/**
 * The shared breakpoint set (src/styles/breakpoints.js) and the build-time
 * expansion of its custom media names (src/styles/customMedia.js).
 */
import { describe, it, expect } from "vitest";
import {
  CUSTOM_MEDIA,
  MEDIA,
  PHONE_MAX_WIDTH,
  WIDE_MIN_WIDTH,
  isPhoneWidth,
  isWideWidth,
} from "../../../src/styles/breakpoints.js";
import customMedia, { expandCustomMedia } from "../../../src/styles/customMedia.js";

describe("breakpoints", () => {
  it("is the doctrine's two-value set: phone 600, wide 1024", () => {
    expect(PHONE_MAX_WIDTH).toBe(600);
    expect(WIDE_MIN_WIDTH).toBe(1024);
    expect(MEDIA.phone).toBe("(max-width: 600px)");
    expect(MEDIA.wide).toBe("(min-width: 1024px)");
  });

  it("classifies the three reference viewports", () => {
    // phone 390, kiosk 800x480, desktop 1280
    expect([390, 800, 1280].map(isPhoneWidth)).toEqual([true, false, false]);
    expect([390, 800, 1280].map(isWideWidth)).toEqual([false, false, true]);
    expect(isPhoneWidth(600)).toBe(true);
    expect(isPhoneWidth(601)).toBe(false);
  });

  it("expands custom media names, keeping the rest of the query", () => {
    expect(expandCustomMedia("(--bp-phone), (orientation: portrait)")).toBe(
      "(max-width: 600px), (orientation: portrait)"
    );
    expect(expandCustomMedia("(max-height: 600px) and (--bp-phone)")).toBe(
      "(max-height: 600px) and (max-width: 600px)"
    );
    expect(expandCustomMedia("(--bp-wide)")).toBe(CUSTOM_MEDIA["--bp-wide"]);
  });

  it("fails loudly on an unknown name", () => {
    expect(() => expandCustomMedia("(--bp-tablet)")).toThrow(/Unknown custom media --bp-tablet/);
  });

  it("is a PostCSS plugin that rewrites @media params in place", () => {
    const plugin = customMedia();
    const atRule = { params: "(--bp-phone)" };
    plugin.AtRule.media(atRule);
    expect(atRule.params).toBe("(max-width: 600px)");
    const untouched = { params: "(prefers-reduced-motion: reduce)" };
    plugin.AtRule.media(untouched);
    expect(untouched.params).toBe("(prefers-reduced-motion: reduce)");
  });
});
