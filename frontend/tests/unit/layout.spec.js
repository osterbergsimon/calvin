import { describe, it, expect } from "vitest";
import { filterAvailableScreens, resolveKioskActiveScreen } from "@/utils/layout";

const screensConfig = {
  version: 2,
  activeScreenId: "b",
  screens: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("filterAvailableScreens", () => {
  it("returns only allowed screens, in catalog order", () => {
    const out = filterAvailableScreens(screensConfig, ["c", "a"]);
    expect(out.screens.map(s => s.id)).toEqual(["a", "c"]);
  });
  it("null availableIds => all", () => {
    expect(filterAvailableScreens(screensConfig, null).screens.map(s => s.id)).toEqual(["a", "b", "c"]);
  });
  it("ids not in catalog are ignored", () => {
    expect(filterAvailableScreens(screensConfig, ["a", "zzz"]).screens.map(s => s.id)).toEqual(["a"]);
  });
  it("empty intersection fails open to all", () => {
    expect(filterAvailableScreens(screensConfig, ["zzz"]).screens.map(s => s.id)).toEqual(["a", "b", "c"]);
  });
  it("empty array availableIds => all (fail open)", () => {
    expect(filterAvailableScreens(screensConfig, []).screens.map(s => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("resolveKioskActiveScreen", () => {
  const base = { screensConfig };
  it("prefers a valid defaultScreenId", () => {
    expect(resolveKioskActiveScreen({ ...base, availableScreens: null, defaultScreenId: "c", current: null })).toBe("c");
  });
  it("falls back to global activeScreenId when no default", () => {
    expect(resolveKioskActiveScreen({ ...base, availableScreens: null, defaultScreenId: null, current: null })).toBe("b");
  });
  it("keeps a still-valid current over reseeding", () => {
    expect(resolveKioskActiveScreen({ ...base, availableScreens: null, defaultScreenId: "c", current: "a" })).toBe("a");
  });
  it("default not in availableScreens => first available", () => {
    expect(resolveKioskActiveScreen({ ...base, availableScreens: ["a", "c"], defaultScreenId: "b", current: null })).toBe("a");
  });
  it("current no longer available => reseed to first available", () => {
    expect(resolveKioskActiveScreen({ ...base, availableScreens: ["c"], defaultScreenId: null, current: "a" })).toBe("c");
  });
  // normalizeDashboardScreens always injects a fallback "screen-home" for empty/null screens[], so
  // filtered.screens can never be zero-length in practice — the `?? null` at the end of
  // resolveKioskActiveScreen is defensive dead code. The minimum realistic case returns the
  // fallback screen id ("screen-home"), not null.
  it("empty catalog is normalized to a fallback screen — resolver returns its id, not null", () => {
    const result = resolveKioskActiveScreen({ screensConfig: { version: 2, activeScreenId: null, screens: [] }, availableScreens: null, defaultScreenId: null, current: null });
    expect(typeof result).toBe("string");
    expect(result).toBe("screen-home");
  });
});
