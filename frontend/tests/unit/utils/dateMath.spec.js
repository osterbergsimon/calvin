/**
 * Unit tests for month arithmetic helpers.
 *
 * Regression guard for CLV-70: `date.setMonth(date.getMonth() + 1)` rolls
 * forward when the current day does not exist in the target month
 * (Oct 31 -> "Nov 31" -> Dec 1), skipping a month. `addMonths` must clamp to
 * the last valid day instead.
 */

import { describe, it, expect } from "vitest";
import { addMonths } from "@/utils/dateMath";

const ymd = date => [date.getFullYear(), date.getMonth(), date.getDate()];

describe("addMonths", () => {
  it("steps a normal mid-month date without clamping (Oct 15 -> Nov 15)", () => {
    expect(ymd(addMonths(new Date(2026, 9, 15), 1))).toEqual([2026, 10, 15]);
  });

  it("clamps Oct 31 -> Nov 30 instead of rolling into December", () => {
    expect(ymd(addMonths(new Date(2026, 9, 31), 1))).toEqual([2026, 10, 30]);
  });

  it("clamps Mar 31 -> Feb 28 in a non-leap year", () => {
    expect(ymd(addMonths(new Date(2026, 2, 31), -1))).toEqual([2026, 1, 28]);
  });

  it("clamps Mar 31 -> Feb 29 in a leap year", () => {
    expect(ymd(addMonths(new Date(2028, 2, 31), -1))).toEqual([2028, 1, 29]);
  });

  it("clamps Jan 31 -> Feb 28 in a non-leap year", () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toEqual([2026, 1, 28]);
  });

  it("rolls the year forward from Dec 31 -> Jan 31", () => {
    expect(ymd(addMonths(new Date(2026, 11, 31), 1))).toEqual([2027, 0, 31]);
  });

  it("rolls the year backward from Jan 31 -> Dec 31", () => {
    expect(ymd(addMonths(new Date(2027, 0, 31), -1))).toEqual([2026, 11, 31]);
  });

  it("does not mutate the input date", () => {
    const input = new Date(2026, 9, 31);
    addMonths(input, 1);
    expect(ymd(input)).toEqual([2026, 9, 31]);
  });

  it("keeps the time of day", () => {
    const result = addMonths(new Date(2026, 0, 31, 13, 45, 30), 1);
    expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([13, 45, 30]);
  });
});
