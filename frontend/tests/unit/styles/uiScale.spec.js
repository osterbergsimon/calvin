import { describe, it, expect } from "vitest";
import {
  UI_SIZE_PRESETS,
  DEFAULT_UI_SIZE,
  UI_SIZE_OPTIONS,
  isUiSize,
  uiScaleFor,
} from "@/styles/uiScale";

describe("uiScale preset map", () => {
  it("maps each preset key to its scale factor", () => {
    expect(uiScaleFor("extra-compact")).toBe(0.7);
    expect(uiScaleFor("compact")).toBe(0.85);
    expect(uiScaleFor("default")).toBe(1.0);
    expect(uiScaleFor("large")).toBe(1.15);
    expect(uiScaleFor("extra-large")).toBe(1.3);
  });

  it("falls back to Default (1.0) for unknown or missing keys", () => {
    expect(uiScaleFor("nonsense")).toBe(1.0);
    expect(uiScaleFor(undefined)).toBe(1.0);
    expect(uiScaleFor(null)).toBe(1.0);
    expect(DEFAULT_UI_SIZE).toBe("default");
  });

  it("isUiSize recognizes only known preset keys", () => {
    expect(isUiSize("compact")).toBe(true);
    expect(isUiSize("extra-large")).toBe(true);
    expect(isUiSize("huge")).toBe(false);
    expect(isUiSize(undefined)).toBe(false);
  });

  it("exposes one option per preset in a stable order", () => {
    expect(UI_SIZE_OPTIONS.map(o => o.value)).toEqual(Object.keys(UI_SIZE_PRESETS));
    expect(UI_SIZE_OPTIONS.every(o => typeof o.label === "string" && o.label)).toBe(true);
  });
});
