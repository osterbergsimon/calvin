import { describe, it, expect } from "vitest";
import {
  EFFECTS_LEVEL_OPTIONS,
  applyEffectsLevel,
  effectsLevelLabel,
  normalizeEffectsLevel,
  resolveEffectsLevel,
} from "@/utils/effectsLevel";

describe("effects level resolution (calvin-uudb)", () => {
  it("auto is Standard on a set-up kiosk, whatever its display stack", () => {
    expect(resolveEffectsLevel({ level: "auto", kiosk: true })).toBe("standard");
  });

  it("auto is Full in a plain browser", () => {
    expect(resolveEffectsLevel({ level: "auto", kiosk: false })).toBe("full");
  });

  it("treats a missing or unknown value as Auto", () => {
    expect(resolveEffectsLevel({ level: undefined, kiosk: true })).toBe("standard");
    expect(resolveEffectsLevel({ level: "sparkles", kiosk: false })).toBe("full");
  });

  it("keeps an explicit Full or Standard, on a kiosk and in a browser", () => {
    expect(resolveEffectsLevel({ level: "full", kiosk: true })).toBe("full");
    expect(resolveEffectsLevel({ level: "standard", kiosk: false })).toBe("standard");
  });

  it("accepts a stray stored 'performance' as Standard", () => {
    expect(normalizeEffectsLevel("performance")).toBe("standard");
    expect(resolveEffectsLevel({ level: "performance", kiosk: false })).toBe("standard");
  });

  it("normalises case and surrounding space from a hand-edited config", () => {
    expect(normalizeEffectsLevel("  Standard ")).toBe("standard");
    expect(normalizeEffectsLevel("FULL")).toBe("full");
  });

  it("offers Auto, Full and Standard in that order", () => {
    expect(EFFECTS_LEVEL_OPTIONS.map(option => option.value)).toEqual(["auto", "full", "standard"]);
    expect(effectsLevelLabel("performance")).toBe("Standard");
  });

  it("writes the resolved level to the data-effects attribute", () => {
    const root = document.createElement("html");
    applyEffectsLevel("standard", root);
    expect(root.getAttribute("data-effects")).toBe("standard");
    applyEffectsLevel("full", root);
    expect(root.getAttribute("data-effects")).toBe("full");
  });
});
