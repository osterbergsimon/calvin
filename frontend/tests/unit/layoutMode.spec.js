/**
 * calvin-tnkg — forcing the desktop or phone layout.
 *
 * A kiosk's choice is stored in its screen overrides; any other browser keeps
 * its own choice in localStorage. Both are expressed as one class on <html>,
 * so the JS breakpoints and the CSS custom media agree on the effective layout.
 * Auto means "decide from the viewport", i.e. today's behaviour.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  LAYOUT_MODES,
  LAYOUT_STORAGE_KEY,
  applyLayoutMode,
  normalizeLayoutMode,
  resolveLayoutMode,
} from "../../src/utils/layoutMode.js";
import { LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS } from "../../src/styles/breakpoints.js";

const root = () => document.documentElement.classList;

describe("layout override", () => {
  afterEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });

  it("offers Auto, Desktop and Phone", () => {
    expect(LAYOUT_MODES).toEqual(["auto", "desktop", "phone"]);
    expect(LAYOUT_STORAGE_KEY).toBe("calvin-layout-mode");
  });

  it("lets the screen setting win on a kiosk, ignoring the browser's own choice", () => {
    expect(resolveLayoutMode({ kiosk: true, screenValue: "phone", browserValue: "desktop" })).toBe(
      "phone"
    );
    expect(resolveLayoutMode({ kiosk: true, screenValue: "auto", browserValue: "desktop" })).toBe(
      "auto"
    );
    // No screen choice of its own: Auto, never the browser's leftover choice.
    expect(resolveLayoutMode({ kiosk: true, screenValue: null, browserValue: "desktop" })).toBe(
      "auto"
    );
  });

  it("uses the browser's own choice off a kiosk", () => {
    expect(resolveLayoutMode({ kiosk: false, screenValue: "phone", browserValue: "desktop" })).toBe(
      "desktop"
    );
    expect(resolveLayoutMode({ kiosk: false, browserValue: "phone" })).toBe("phone");
    expect(resolveLayoutMode({ kiosk: false })).toBe("auto");
  });

  it("falls back to Auto for a missing or unknown value", () => {
    expect(normalizeLayoutMode(undefined)).toBe("auto");
    expect(normalizeLayoutMode("")).toBe("auto");
    expect(normalizeLayoutMode("AUTO")).toBe("auto");
    expect(normalizeLayoutMode("tablet")).toBe("auto");
    expect(resolveLayoutMode({ kiosk: false, browserValue: "tablet" })).toBe("auto");
  });

  it("marks <html> with exactly one layout class, none for Auto", () => {
    expect(applyLayoutMode("desktop")).toBe("desktop");
    expect(root().contains(LAYOUT_DESKTOP_CLASS)).toBe(true);
    expect(root().contains(LAYOUT_PHONE_CLASS)).toBe(false);

    applyLayoutMode("phone");
    expect(root().contains(LAYOUT_PHONE_CLASS)).toBe(true);
    expect(root().contains(LAYOUT_DESKTOP_CLASS)).toBe(false);

    applyLayoutMode("auto");
    expect(root().contains(LAYOUT_DESKTOP_CLASS)).toBe(false);
    expect(root().contains(LAYOUT_PHONE_CLASS)).toBe(false);
  });

  it("normalizes before applying, so a bad value falls back to Auto", () => {
    applyLayoutMode("desktop");
    expect(applyLayoutMode("sideways")).toBe("auto");
    expect(root().contains(LAYOUT_DESKTOP_CLASS)).toBe(false);
  });
});
