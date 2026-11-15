import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion, scrollBehavior } from "@/utils/scrollIntoViewMotion";

const originalMatchMedia = window.matchMedia;

const stubMatchMedia = matches => {
  window.matchMedia = vi.fn(query => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("scrollIntoViewMotion", () => {
  it("uses smooth scrolling when reduced motion is off", () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("uses an instant jump when reduced motion is on", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("falls back to smooth scrolling when matchMedia is missing", () => {
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});
