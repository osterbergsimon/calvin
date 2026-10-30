import { describe, it, expect } from "vitest";
import { autoVisibleEventCount, DEFAULT_EVENT_ROW_HEIGHT } from "@/utils/calendarDensity";

describe("autoVisibleEventCount", () => {
  it("fits as many rows as the measured day cell allows", () => {
    expect(autoVisibleEventCount(100, 20)).toBe(5);
    expect(autoVisibleEventCount(96, 20)).toBe(4);
  });

  it("always shows at least one event row", () => {
    expect(autoVisibleEventCount(12, 20)).toBe(1);
    expect(autoVisibleEventCount(0, 20)).toBe(1);
    expect(autoVisibleEventCount(null, 20)).toBe(1);
  });

  it("falls back to the default chip height when a row cannot be measured", () => {
    expect(autoVisibleEventCount(80, 0)).toBe(Math.floor(80 / DEFAULT_EVENT_ROW_HEIGHT));
    expect(autoVisibleEventCount(80, null)).toBe(Math.floor(80 / DEFAULT_EVENT_ROW_HEIGHT));
  });
});
