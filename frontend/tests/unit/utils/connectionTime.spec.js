/** "data from {time}" stamp formatting (CLV-48 §2). */

import { describe, it, expect } from "vitest";
import { formatDataFrom } from "@/utils/connectionTime";

const at = (y, m, d, h = 9, min = 7) => new Date(y, m - 1, d, h, min);
const now = at(2026, 10, 30); // Thu 30 Oct 2026, 09:07 local

describe("formatDataFrom", () => {
  it("uses HH:MM today, 24h", () => {
    expect(formatDataFrom(at(2026, 10, 30, 8, 41), { timeFormat: "24h", now })).toBe("08:41");
  });

  it("uses 12h today when that is the configured format", () => {
    expect(formatDataFrom(at(2026, 10, 30, 8, 41), { timeFormat: "12h", now })).toBe("8:41 AM");
  });

  it("uses the weekday for another day this week", () => {
    expect(formatDataFrom(at(2026, 10, 28, 14, 2), { timeFormat: "24h", now })).toBe("Wed 14:02");
  });

  it("uses day + month once the data is older than six days", () => {
    expect(formatDataFrom(at(2026, 10, 12, 14, 2), { timeFormat: "24h", now })).toBe("12 Oct");
  });

  it("treats exactly seven days ago as older than a week", () => {
    expect(formatDataFrom(at(2026, 10, 23, 14, 2), { timeFormat: "24h", now })).toBe("23 Oct");
  });

  it("returns an empty string without a successful check", () => {
    expect(formatDataFrom(null, { now })).toBe("");
    expect(formatDataFrom(undefined, { now })).toBe("");
    expect(formatDataFrom(new Date("nope"), { now })).toBe("");
  });

  it("follows the configured time zone", () => {
    // 23:41 UTC on the 29th is 08:41 on the 30th in Tokyo.
    const stamp = new Date("2026-10-29T23:41:00Z");
    const tokyoNow = new Date("2026-10-30T00:30:00Z");
    expect(
      formatDataFrom(stamp, { timeFormat: "24h", timezone: "Asia/Tokyo", now: tokyoNow })
    ).toBe("08:41");
  });
});
