import { describe, it, expect } from "vitest";
import { screenLabel, screenLabelFallback } from "@/utils/screenLabel";

describe("screenLabel", () => {
  it("uses the screen's Name when one is set", () => {
    expect(
      screenLabel({
        id: "calvin400-16d03d",
        hostname: "calvin400",
        overrides: { displayName: "Kitchen" },
      })
    ).toBe("Kitchen");
  });

  it("falls back to the hostname when no Name is set", () => {
    expect(screenLabel({ id: "calvin400-16d03d", hostname: "calvin400", overrides: {} })).toBe(
      "calvin400"
    );
    expect(screenLabel({ id: "calvin400-16d03d", hostname: "calvin400" })).toBe("calvin400");
  });

  it("falls back to the kiosk id when there is no Name and no hostname", () => {
    expect(screenLabel({ id: "calvin400-16d03d", hostname: "", overrides: {} })).toBe(
      "calvin400-16d03d"
    );
    expect(screenLabel({ id: "calvin400-16d03d" })).toBe("calvin400-16d03d");
  });

  it("returns an empty string for a missing screen", () => {
    expect(screenLabel(null)).toBe("");
    expect(screenLabel(undefined)).toBe("");
  });
});

describe("screenLabelFallback", () => {
  it("ignores the Name and returns hostname, then id", () => {
    const named = { id: "calvin400-16d03d", hostname: "calvin400" };
    expect(screenLabelFallback({ ...named, overrides: { displayName: "Kitchen" } })).toBe(
      "calvin400"
    );
    expect(screenLabelFallback({ id: "calvin400-16d03d", hostname: "" })).toBe("calvin400-16d03d");
    expect(screenLabelFallback(null)).toBe("");
  });
});
