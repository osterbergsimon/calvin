import { describe, it, expect } from "vitest";
import { effectiveAvailablePages } from "@/utils/availablePages";

const pages = [{ id: "home" }, { id: "photos" }];

describe("effectiveAvailablePages", () => {
  it("uses the kiosk's own allowlist when it has one", () => {
    expect(
      effectiveAvailablePages(
        { availableScreens: ["photos"] },
        { availableScreens: ["home"] },
        pages
      )
    ).toEqual(["photos"]);
  });

  it("falls back to Default's restricted list when the kiosk has no override", () => {
    expect(effectiveAvailablePages({}, { availableScreens: ["photos"] }, pages)).toEqual([
      "photos",
    ]);
  });

  it("shows every page when neither the kiosk nor Default restricts them", () => {
    expect(effectiveAvailablePages({}, { availableScreens: null }, pages)).toEqual([
      "home",
      "photos",
    ]);
    expect(effectiveAvailablePages({}, {}, pages)).toEqual(["home", "photos"]);
  });

  it("keeps an explicit empty kiosk allowlist (no pages)", () => {
    expect(
      effectiveAvailablePages({ availableScreens: [] }, { availableScreens: ["home"] }, pages)
    ).toEqual([]);
  });
});
