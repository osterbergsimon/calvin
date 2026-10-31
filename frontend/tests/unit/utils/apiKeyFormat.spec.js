import { describe, it, expect } from "vitest";
import { formatKeyDate, formatLastUsed } from "@/utils/apiKeyFormat";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("formatKeyDate", () => {
  it("omits the year in the current year and adds it otherwise", () => {
    expect(formatKeyDate("2026-10-28T09:00:00Z", NOW)).toBe("28 Oct");
    expect(formatKeyDate("2025-03-04T09:00:00Z", NOW)).toBe("4 Mar 2025");
  });

  it("returns an empty string for an invalid date instead of NaN", () => {
    expect(formatKeyDate("not-a-date", NOW)).toBe("");
    expect(formatKeyDate(undefined, NOW)).toBe("");
    expect(formatKeyDate(null, NOW)).toBe("");
    expect(formatKeyDate(NaN, NOW)).toBe("");
  });
});

describe("formatLastUsed", () => {
  it("falls back to the date once a week has passed", () => {
    expect(formatLastUsed("2026-09-02T12:00:00Z", NOW)).toBe("2 Sep");
  });

  it("returns an empty string for an invalid date instead of NaN", () => {
    expect(formatLastUsed("not-a-date", NOW)).toBe("");
  });
});
