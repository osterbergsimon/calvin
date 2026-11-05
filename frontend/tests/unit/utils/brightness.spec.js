import { describe, it, expect } from "vitest";
import {
  availability,
  checkSummary,
  ddcToMenu,
  dimSeconds,
  firstBrightness,
  fitConversion,
  fitSentence,
  maxPickable,
  menuToDdc,
  nextReadingPoint,
  readingsOutlier,
} from "@/utils/brightness";

const READINGS = [
  { ddc: 5, menu: 28 },
  { ddc: 19, menu: 61 },
];

describe("fitConversion", () => {
  it("needs two readings at different values", () => {
    expect(fitConversion([])).toBeNull();
    expect(fitConversion([{ ddc: 5, menu: 28 }])).toBeNull();
    expect(
      fitConversion([
        { ddc: 5, menu: 28 },
        { ddc: 5, menu: 30 },
      ])
    ).toBeNull();
  });

  it("fits menu ≈ a + b × Calvin value through two points", () => {
    const fit = fitConversion(READINGS);
    expect(fit.slope).toBeCloseTo(33 / 14, 5);
    expect(ddcToMenu(19, READINGS)).toBe(61);
    expect(menuToDdc(61, READINGS)).toBe(19);
  });

  it("describes the fit in words", () => {
    expect(
      fitSentence([
        { ddc: 5, menu: 28 },
        { ddc: 19, menu: 61 },
      ])
    ).toMatch(/^menu ≈ 16 \+ 2\.4 × Calvin value$/);
    expect(fitSentence([])).toBe("");
  });

  it("returns null estimates without a fit", () => {
    expect(ddcToMenu(10, [])).toBeNull();
    expect(menuToDdc(40, [{ ddc: 5, menu: 28 }])).toBeNull();
  });
});

describe("readingsOutlier", () => {
  it("flags a third reading more than 5 menu units off the line", () => {
    expect(readingsOutlier([...READINGS, { ddc: 12, menu: 80 }])).toBe(true);
  });
  it("accepts a reading near the line and needs three readings", () => {
    expect(readingsOutlier([...READINGS, { ddc: 12, menu: 46 }])).toBe(false);
    expect(readingsOutlier(READINGS)).toBe(false);
  });
});

describe("limits", () => {
  it("allows the limit minus two steps", () => {
    expect(maxPickable(26, 2)).toBe(22);
    expect(maxPickable(26, 3)).toBe(20);
    expect(maxPickable(null, 2)).toBe(100);
    expect(maxPickable(3, 2)).toBe(0);
  });
  it("starts at the lower of limit minus two steps and 20", () => {
    expect(firstBrightness(26, 2)).toBe(20);
    expect(firstBrightness(22, 2)).toBe(18);
    expect(firstBrightness(null, 2)).toBe(20);
  });
  it("picks conversion points 5, the middle, then near the top, never above the limit", () => {
    expect(nextReadingPoint([], 26, 2)).toBe(5);
    expect(nextReadingPoint([{ ddc: 5, menu: 28 }], 26, 2)).toBe(11);
    expect(
      nextReadingPoint(
        [
          { ddc: 5, menu: 28 },
          { ddc: 11, menu: 41 },
        ],
        26,
        2
      )
    ).toBe(22);
  });
  it("stays at 20 or below without a limit", () => {
    expect(nextReadingPoint([{ ddc: 5, menu: 28 }], null, 2)).toBe(10);
    expect(
      nextReadingPoint(
        [
          { ddc: 5, menu: 28 },
          { ddc: 10, menu: 40 },
        ],
        null,
        2
      )
    ).toBe(20);
  });
});

describe("dimSeconds", () => {
  it("estimates the dim from the level and step", () => {
    expect(dimSeconds(19, 2, 1.5)).toBe(15);
    expect(dimSeconds(0, 2, 1.5)).toBe(0);
  });
});

describe("availability", () => {
  const found = { ddc: true, writes: true, checkedAt: "2026-11-04T10:00:00Z" };
  it("is available after a good check", () => {
    expect(availability({ displayStack: "cog" }, found).state).toBe("ok");
  });
  it("is never-checked without findings and keeps the toggle usable", () => {
    const a = availability({ displayStack: "cog" }, null);
    expect(a.state).toBe("never");
    expect(a.disabled).toBe(false);
    expect(a.text).toMatch(/checks the display first/);
  });
  it("explains no DDC with Check again", () => {
    const a = availability({ displayStack: "cog" }, { ...found, ddc: false, writes: null });
    expect(a.state).toBe("no-ddc");
    expect(a.disabled).toBe(true);
    expect(a.action).toBe("check");
    expect(a.text).toMatch(/DDC\/CI/);
    expect(a.text).toMatch(/4 Nov/);
  });
  it("explains writes that don't take effect", () => {
    const a = availability({ displayStack: "cog" }, { ...found, writes: false });
    expect(a.state).toBe("no-writes");
    expect(a.disabled).toBe(true);
    expect(a.text).toMatch(/don't change it/);
  });
  it("needs cog and names the stack", () => {
    const a = availability({ displayStack: "x11", displayName: "Hallway" }, found, "Hallway");
    expect(a.state).toBe("not-cog");
    expect(a.disabled).toBe(true);
    expect(a.text).toBe("Needs the Calvin kiosk display (cog). Hallway uses X11.");
  });
});

describe("checkSummary", () => {
  it("says Not checked yet", () => {
    expect(checkSummary(null, [], null)).toBe("Not checked yet");
  });
  it("lists what was found", () => {
    expect(
      checkSummary(
        { ddc: true, writes: true, checkedAt: "2026-11-04T10:00:00Z" },
        [
          { ddc: 5, menu: 28 },
          { ddc: 12, menu: 44 },
          { ddc: 19, menu: 61 },
        ],
        26
      )
    ).toBe(
      "Answers brightness commands · changes take effect · menu match from 3 readings · limit 26 (4 Nov)"
    );
  });
});
