import { describe, it, expect } from "vitest";
import { computeFitBoundary } from "@/composables/useFitClamp.js";

describe("computeFitBoundary", () => {
  // Three horizontal items, each its own track (distinct starts).
  const oneDim = [
    { start: 0, end: 90 },
    { start: 100, end: 190 },
    { start: 200, end: 290 },
    { start: 300, end: 390 },
  ];

  it("returns the last whole item that fits (1D)", () => {
    // Container 295px: items 1-3 fit (end 290), 4th (end 390) does not.
    const r = computeFitBoundary(oneDim, 295);
    expect(r.fitCount).toBe(3);
    expect(r.fits).toBe(290);
    expect(r.hasOverflow).toBe(true);
  });

  it("no overflow when everything fits", () => {
    const r = computeFitBoundary(oneDim, 400);
    expect(r.fitCount).toBe(4);
    expect(r.hasOverflow).toBe(false);
    expect(r.fits).toBe(390);
  });

  it("groups items sharing a start into one track (2D rows)", () => {
    // Two rows of two cards. Row 1 ends at 80, row 2 at 170.
    const grid = [
      { start: 0, end: 80 },
      { start: 0, end: 78 },
      { start: 90, end: 170 },
      { start: 90, end: 168 },
    ];
    // Container 130px: only row 1 fits; both its cards count.
    const r = computeFitBoundary(grid, 130);
    expect(r.trackCount).toBe(2);
    expect(r.fitCount).toBe(2);
    expect(r.fits).toBe(80);
    expect(r.hasOverflow).toBe(true);
  });

  it("never blanks: shows the first track even if it overflows", () => {
    const r = computeFitBoundary([{ start: 0, end: 200 }], 120);
    expect(r.fitCount).toBe(1);
    expect(r.fits).toBe(200);
    expect(r.hasOverflow).toBe(true);
  });

  it("empty input is a no-op", () => {
    expect(computeFitBoundary([], 100)).toEqual({
      fits: 0,
      fitCount: 0,
      hasOverflow: false,
      trackCount: 0,
    });
  });
});
