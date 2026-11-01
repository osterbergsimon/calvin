/**
 * The shared breakpoint set (src/styles/breakpoints.js) and the build-time
 * expansion of its custom media names (src/styles/customMedia.js).
 */
import { afterEach, describe, it, expect } from "vitest";
import postcss from "postcss";
import {
  CUSTOM_MEDIA,
  KIOSK_ROOT_CLASS,
  MEDIA,
  PHONE_MAX_HEIGHT,
  PHONE_MAX_WIDTH,
  WIDE_MIN_WIDTH,
  isPhone,
  isPhoneWidth,
  isWideWidth,
} from "../../../src/styles/breakpoints.js";
import customMedia, { expandCustomMedia } from "../../../src/styles/customMedia.js";

const run = css => postcss([customMedia()]).process(css, { from: undefined }).css;
const squash = css => css.replace(/\s+/g, " ").trim();

describe("breakpoints", () => {
  afterEach(() => document.documentElement.classList.remove(KIOSK_ROOT_CLASS));

  it("is the doctrine's set: phone 600 wide or 500 tall (landscape), wide 1024", () => {
    expect(PHONE_MAX_WIDTH).toBe(600);
    expect(PHONE_MAX_HEIGHT).toBe(500);
    expect(WIDE_MIN_WIDTH).toBe(1024);
    expect(MEDIA.phoneWidth).toBe("(max-width: 600px)");
    expect(MEDIA.phoneLandscape).toBe("(max-height: 500px) and (orientation: landscape)");
    expect(MEDIA.phone).toBe(`${MEDIA.phoneWidth}, ${MEDIA.phoneLandscape}`);
    expect(MEDIA.wide).toBe("(min-width: 1024px)");
    expect(Object.keys(CUSTOM_MEDIA)).toEqual(["--bp-phone", "--bp-wide"]);
  });

  it("classifies the reference viewports by width", () => {
    // phone 390, kiosk 800x480, desktop 1280
    expect([390, 800, 1280].map(isPhoneWidth)).toEqual([true, false, false]);
    expect([390, 800, 1280].map(isWideWidth)).toEqual([false, false, true]);
    expect(isPhoneWidth(600)).toBe(true);
    expect(isPhoneWidth(601)).toBe(false);
  });

  it("keeps a landscape phone a phone", () => {
    expect(isPhone(390, 844)).toBe(true);
    expect(isPhone(667, 375)).toBe(true); // iPhone SE / 8 landscape
    expect(isPhone(640, 360)).toBe(true); // 640-wide Android landscape
    expect(isPhone(480, 800)).toBe(true); // portrait Pi 7" (accepted)
    expect(isPhone(1280, 800)).toBe(false);
    expect(isPhone(1024, 600)).toBe(false);
  });

  it("exempts the kiosk: an 800x480 kiosk is not a phone", () => {
    // Without the kiosk signal an 800x480 window is short and landscape.
    expect(isPhone(800, 480)).toBe(true);
    document.documentElement.classList.add(KIOSK_ROOT_CLASS);
    expect(isPhone(800, 480)).toBe(false);
    expect(isPhone(667, 375)).toBe(false);
    // Width still decides on a kiosk: a portrait Pi is a phone layout.
    expect(isPhone(480, 800)).toBe(true);
    expect(isPhone(800, 480, { kiosk: false })).toBe(true);
  });

  it("expands custom media names, keeping the rest of the query", () => {
    expect(expandCustomMedia("(--bp-phone), (orientation: portrait)")).toBe(
      "(max-width: 600px), (orientation: portrait)"
    );
    expect(expandCustomMedia("(max-height: 600px) and (--bp-phone)")).toBe(
      "(max-height: 600px) and (max-width: 600px)"
    );
    expect(expandCustomMedia("(--bp-wide)")).toBe("(min-width: 1024px)");
  });

  it("fails loudly on an unknown name", () => {
    expect(() => expandCustomMedia("(--bp-tablet)")).toThrow(/Unknown custom media --bp-tablet/);
  });

  describe("through real PostCSS", () => {
    it("expands --bp-phone into the width block and a non-kiosk landscape block", () => {
      expect(squash(run("@media (--bp-phone){a{color:red}}"))).toBe(
        "@media (max-width: 600px){a{color:red}}" +
          "@media (max-height: 500px) and (orientation: landscape){" +
          `:where(:root:not(.${KIOSK_ROOT_CLASS})) a{color:red}}`
      );
    });

    it("keeps the other queries of a list and distributes an `and`", () => {
      expect(squash(run("@media (--bp-phone), (orientation: portrait){.a{gap:0}}"))).toBe(
        "@media (max-width: 600px), (orientation: portrait){.a{gap:0}}" +
          "@media (max-height: 500px) and (orientation: landscape){" +
          `:where(:root:not(.${KIOSK_ROOT_CLASS})) .a{gap:0}}`
      );
      expect(squash(run("@media (max-height: 600px) and (--bp-phone){.a{gap:0}}"))).toBe(
        "@media (max-height: 600px) and (max-width: 600px){.a{gap:0}}" +
          "@media (max-height: 600px) and (max-height: 500px) and (orientation: landscape){" +
          `:where(:root:not(.${KIOSK_ROOT_CLASS})) .a{gap:0}}`
      );
    });

    it("scopes every selector of a list, root selectors included, and skips keyframes", () => {
      const out = squash(
        run("@media (--bp-phone){.a,.b>.c{x:1} :root{y:2} html{z:3} @keyframes k{from{o:0}}}")
      );
      const not = `:not(.${KIOSK_ROOT_CLASS})`;
      expect(out).toContain(`:where(:root${not}) .a,:where(:root${not}) .b>.c{x:1}`);
      expect(out).toContain(`:root:where(${not}){y:2}`);
      expect(out).toContain(`html:where(${not}){z:3}`);
      expect(out).toContain("@keyframes k{from{o:0}}");
    });

    it("leaves --bp-wide and plain queries as one block", () => {
      expect(squash(run("@media (--bp-wide){a{b:c}}"))).toBe("@media (min-width: 1024px){a{b:c}}");
      expect(squash(run("@media (prefers-reduced-motion: reduce){a{b:c}}"))).toBe(
        "@media (prefers-reduced-motion: reduce){a{b:c}}"
      );
    });

    it("rejects an unknown name", () => {
      expect(() => run("@media (--bp-tablet){a{b:c}}")).toThrow(/Unknown custom media --bp-tablet/);
    });
  });
});
