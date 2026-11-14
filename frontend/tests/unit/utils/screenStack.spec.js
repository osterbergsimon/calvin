import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readScreenStackMode } from "@/utils/screenStack";

const KEY = "calvin.screenStack";
const realLocation = window.location;

function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi" },
    writable: true,
    configurable: true,
  });
}

describe("readScreenStackMode", () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEY);
    setSearch("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: realLocation,
      writable: true,
      configurable: true,
    });
  });

  it("is off by default", () => {
    expect(readScreenStackMode()).toBe("off");
  });

  it("takes the mode from the query string and remembers it", () => {
    setSearch("?kiosk=k1&screenStack=opacity");
    expect(readScreenStackMode()).toBe("opacity");
    expect(window.localStorage.getItem(KEY)).toBe("opacity");

    setSearch("?kiosk=k1");
    expect(readScreenStackMode()).toBe("opacity");
  });

  it("turns off again with screenStack=off", () => {
    window.localStorage.setItem(KEY, "visibility");
    setSearch("?screenStack=off");
    expect(readScreenStackMode()).toBe("off");
    setSearch("");
    expect(readScreenStackMode()).toBe("off");
  });

  it("ignores unknown values", () => {
    setSearch("?screenStack=fast");
    expect(readScreenStackMode()).toBe("off");
    window.localStorage.setItem(KEY, "fast");
    setSearch("");
    expect(readScreenStackMode()).toBe("off");
  });

  it("falls back to off when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readScreenStackMode()).toBe("off");
  });
});
