import { describe, it, expect, afterEach } from "vitest";
import { readScreenStackOverride, wantsScreenStack } from "@/utils/screenStack";

const realLocation = window.location;

function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi" },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: realLocation,
    writable: true,
    configurable: true,
  });
  window.localStorage.clear();
});

describe("readScreenStackOverride", () => {
  it("is null without the parameter", () => {
    setSearch("?kiosk=k1");
    expect(readScreenStackOverride()).toBeNull();
  });

  it("reads on and off", () => {
    setSearch("?screenStack=on");
    expect(readScreenStackOverride()).toBe(true);
    setSearch("?screenStack=off");
    expect(readScreenStackOverride()).toBe(false);
  });

  it("ignores any other value, including the retired modes", () => {
    for (const value of ["opacity", "visibility", "fast", ""]) {
      setSearch(`?screenStack=${value}`);
      expect(readScreenStackOverride()).toBeNull();
    }
  });

  it("is not remembered", () => {
    setSearch("?screenStack=on");
    readScreenStackOverride();
    expect(window.localStorage.length).toBe(0);
    setSearch("");
    expect(readScreenStackOverride()).toBeNull();
  });
});

describe("wantsScreenStack", () => {
  it("follows the kiosk's setting", () => {
    expect(wantsScreenStack({ kioskId: "k1", keepScreensReady: true })).toBe(true);
    expect(wantsScreenStack({ kioskId: "k1", keepScreensReady: false })).toBe(false);
  });

  it("is off in a browser that is not a known kiosk", () => {
    expect(wantsScreenStack({ kioskId: null, keepScreensReady: true })).toBe(false);
  });

  it("is off unless the value is exactly true", () => {
    expect(wantsScreenStack({ kioskId: "k1", keepScreensReady: "true" })).toBe(false);
    expect(wantsScreenStack({ kioskId: "k1", keepScreensReady: undefined })).toBe(false);
  });

  it("lets the URL override win either way", () => {
    expect(wantsScreenStack({ kioskId: null, keepScreensReady: false, override: true })).toBe(true);
    expect(wantsScreenStack({ kioskId: "k1", keepScreensReady: true, override: false })).toBe(
      false
    );
  });
});
