/**
 * The shared breakpoint set (src/styles/breakpoints.js) and the build-time
 * expansion of its custom media names (src/styles/customMedia.js).
 */
import { afterEach, describe, it, expect } from "vitest";
import postcss from "postcss";
import {
  CUSTOM_MEDIA,
  KIOSK_ROOT_CLASS,
  LAYOUT_DESKTOP_CLASS,
  LAYOUT_PHONE_CLASS,
  MEDIA,
  PHONE_MAX_HEIGHT,
  PHONE_MAX_WIDTH,
  WIDE_MIN_WIDTH,
  isPhone,
  isPhoneWidth,
  isWideWidth,
} from "../../../src/styles/breakpoints.js";
import customMedia, {
  expandCustomMedia,
  splitCustomMedia,
} from "../../../src/styles/customMedia.js";

const run = css => postcss([customMedia()]).process(css, { from: undefined }).css;
const squash = css => css.replace(/\s+/g, " ").trim();

describe("breakpoints", () => {
  afterEach(() =>
    document.documentElement.classList.remove(
      KIOSK_ROOT_CLASS,
      LAYOUT_DESKTOP_CLASS,
      LAYOUT_PHONE_CLASS
    )
  );

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

  it("lets a forced layout win over the viewport", () => {
    // Auto is today's rule.
    expect(isPhone(390, 844)).toBe(true);
    expect(isPhoneWidth(390)).toBe(true);

    document.documentElement.classList.add(LAYOUT_DESKTOP_CLASS);
    expect(isPhone(390, 844)).toBe(false);
    expect(isPhoneWidth(390)).toBe(false);
    // A short landscape screen stays desktop when desktop is forced.
    expect(isPhone(800, 480)).toBe(false);

    document.documentElement.classList.remove(LAYOUT_DESKTOP_CLASS);
    document.documentElement.classList.add(LAYOUT_PHONE_CLASS);
    expect(isPhone(1280, 800)).toBe(true);
    expect(isPhoneWidth(1280)).toBe(true);
    // Forced phone wins on a kiosk too, where the height clause never applies.
    document.documentElement.classList.add(KIOSK_ROOT_CLASS);
    expect(isPhone(800, 480)).toBe(true);
    // An explicit Auto (the default) still reads the viewport.
    expect(isPhone(1280, 800, { layout: "auto", kiosk: true })).toBe(false);
  });

  it("keeps the unscoped part of a query list and scopes the layout-dependent parts", () => {
    expect(expandCustomMedia("(--bp-phone), (orientation: portrait)")).toBe(
      "(orientation: portrait)"
    );
    expect(expandCustomMedia("(max-height: 600px) and (--bp-phone)")).toBe("");
    expect(expandCustomMedia("(--bp-wide)")).toBe("(min-width: 1024px)");
  });

  it("splits --bp-phone into its viewport, kiosk and forced-layout variants", () => {
    expect(splitCustomMedia("(--bp-phone), (orientation: portrait)")).toEqual({
      all: "(orientation: portrait)",
      scoped: [
        { scope: `:not(.${LAYOUT_DESKTOP_CLASS})`, queries: "(max-width: 600px)" },
        {
          scope: `:not(.${KIOSK_ROOT_CLASS}):not(.${LAYOUT_DESKTOP_CLASS})`,
          queries: "(max-height: 500px) and (orientation: landscape)",
        },
        // A forced phone applies at any size, kiosk included.
        { scope: `.${LAYOUT_PHONE_CLASS}`, queries: "(min-width: 0px)" },
      ],
    });
  });

  it("fails loudly on an unknown name", () => {
    expect(() => expandCustomMedia("(--bp-tablet)")).toThrow(/Unknown custom media --bp-tablet/);
  });

  describe("through real PostCSS", () => {
    const notDesktop = `:where(:root:not(.${LAYOUT_DESKTOP_CLASS}))`;
    const notKioskNotDesktop = `:where(:root:not(.${KIOSK_ROOT_CLASS}):not(.${LAYOUT_DESKTOP_CLASS}))`;
    const forcedPhone = `:where(:root.${LAYOUT_PHONE_CLASS})`;

    it("expands --bp-phone into viewport, kiosk and forced-phone blocks", () => {
      expect(squash(run("@media (--bp-phone){a{color:red}}"))).toBe(
        `@media (max-width: 600px){${notDesktop} a{color:red}}` +
          "@media (max-height: 500px) and (orientation: landscape){" +
          `${notKioskNotDesktop} a{color:red}}` +
          `@media (min-width: 0px){${forcedPhone} a{color:red}}`
      );
    });

    it("keeps the other queries of a list and distributes an `and`", () => {
      expect(squash(run("@media (--bp-phone), (orientation: portrait){.a{gap:0}}"))).toBe(
        "@media (orientation: portrait){.a{gap:0}}" +
          `@media (max-width: 600px){${notDesktop} .a{gap:0}}` +
          "@media (max-height: 500px) and (orientation: landscape){" +
          `${notKioskNotDesktop} .a{gap:0}}` +
          `@media (min-width: 0px){${forcedPhone} .a{gap:0}}`
      );
      expect(squash(run("@media (max-height: 600px) and (--bp-phone){.a{gap:0}}"))).toBe(
        `@media (max-height: 600px) and (max-width: 600px){${notDesktop} .a{gap:0}}` +
          "@media (max-height: 600px) and (max-height: 500px) and (orientation: landscape){" +
          `${notKioskNotDesktop} .a{gap:0}}` +
          `@media (max-height: 600px) and (min-width: 0px){${forcedPhone} .a{gap:0}}`
      );
    });

    it("scopes every selector of a list, root selectors included, and skips keyframes", () => {
      const out = squash(
        run("@media (--bp-phone){.a,.b>.c{x:1} :root{y:2} html{z:3} @keyframes k{from{o:0}}}")
      );
      expect(out).toContain(`${notDesktop} .a,${notDesktop} .b>.c{x:1}`);
      expect(out).toContain(`:root:where(:not(.${LAYOUT_DESKTOP_CLASS})){y:2}`);
      expect(out).toContain(`html:where(:not(.${LAYOUT_DESKTOP_CLASS})){z:3}`);
      expect(out).toContain("@keyframes k{from{o:0}}");
      // The forced-phone block gets the same root-selector treatment.
      expect(out).toContain(`:root:where(.${LAYOUT_PHONE_CLASS}){y:2}`);
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
