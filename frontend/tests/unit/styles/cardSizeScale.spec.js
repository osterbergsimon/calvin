import { describe, it, expect } from "vitest";
import { cardSizeVars, CARD_SIZE_KEYS, DEFAULT_CARD_SIZE } from "@/styles/cardSizeScale.js";

describe("cardSizeScale", () => {
  it("exposes the five Dashboard-size-aligned keys", () => {
    expect(CARD_SIZE_KEYS).toEqual(["xsmall", "small", "medium", "large", "xlarge"]);
    expect(DEFAULT_CARD_SIZE).toBe("medium");
  });

  it("medium is the current-default no-op (220px / 1rem)", () => {
    expect(cardSizeVars("medium")).toEqual({ "--card-min": "220px", "--card-pad": "1rem" });
  });

  it("returns min-width + padding for each size", () => {
    expect(cardSizeVars("xsmall")).toEqual({ "--card-min": "160px", "--card-pad": "0.6rem" });
    expect(cardSizeVars("xlarge")).toEqual({ "--card-min": "300px", "--card-pad": "1.4rem" });
  });

  it("falls back to medium for unknown input", () => {
    expect(cardSizeVars("bogus")).toEqual(cardSizeVars("medium"));
    expect(cardSizeVars(undefined)).toEqual(cardSizeVars("medium"));
  });
});
