import { describe, it, expect } from "vitest";
import {
  REGION_CHROME_SIZES,
  DEFAULT_REGION_CHROME_SIZE,
  regionChromeVars,
} from "@/styles/regionChromeScale";

describe("regionChromeScale", () => {
  it("exposes the five presets in UI order", () => {
    expect(REGION_CHROME_SIZES).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_REGION_CHROME_SIZE).toBe("medium");
  });

  it("medium is the anchor (28px rail / 1.25rem label / 0.95rem glyph)", () => {
    const v = regionChromeVars("medium");
    expect(v["--region-rail-h"]).toBe("28px");
    expect(v["--region-label-fs"]).toBe("1.25rem");
    expect(v["--region-glyph-fs"]).toBe("0.95rem");
    // IconButton size="custom" compat mirrors rail + glyph
    expect(v["--icon-size"]).toBe("28px");
    expect(v["--icon-font"]).toBe("0.95rem");
    // phase-2 reserve is present
    expect(v["--region-content-fs"]).toBe("1.0rem");
  });

  it("scales the extremes", () => {
    expect(regionChromeVars("xsmall")["--region-rail-h"]).toBe("22px");
    expect(regionChromeVars("xlarge")["--region-rail-h"]).toBe("40px");
  });

  it("falls back to medium for unknown/undefined input", () => {
    expect(regionChromeVars("bogus")).toEqual(regionChromeVars("medium"));
    expect(regionChromeVars(undefined)).toEqual(regionChromeVars("medium"));
  });

  it("every preset defines every var key", () => {
    const keys = Object.keys(regionChromeVars("medium"));
    for (const size of REGION_CHROME_SIZES) {
      expect(Object.keys(regionChromeVars(size))).toEqual(keys);
    }
  });
});
