/**
 * Theme status-hue and calendar-palette contract.
 *
 * D2: status colours must stay apart from the accent, in every built-in theme
 * and both modes. This is a hue problem, not a contrast one, so CLV-64 did not
 * catch it — a warn Tag, an error line and a selected control looked alike.
 *
 *   focus ↔ ok / err  >= 25°
 *   warn  ↔ err       >= 25°
 *   focus ↔ warn      >= 12°   (a warm accent cannot get further from amber)
 *
 * D2 also says status is never colour alone; the components carry a word/icon.
 *
 * Calendar colours (`--event-1…8`) are curated so the chip ink
 * (`--on-event-ink`, fixed white) clears WCAG AA on every one of them.
 */
import { describe, it, expect } from "vitest";
import { palettes, parse, contrast } from "./contrast";
import { THEME_CSS } from "./contrast";

const hue = rgb => {
  const [r, g, b] = rgb.map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const delta = max - min;
  let value;
  if (max === r) value = ((g - b) / delta) % 6;
  else if (max === g) value = (b - r) / delta + 2;
  else value = (r - g) / delta + 4;
  return (value * 60 + 360) % 360;
};

const distance = (a, b) => {
  const diff = Math.abs(hue(parse(a)) - hue(parse(b))) % 360;
  return Math.min(diff, 360 - diff);
};

const RULES = [
  ["focus", "ok", 25],
  ["focus", "err", 25],
  ["warn", "err", 25],
  ["focus", "warn", 12],
];

const ON_EVENT_INK = THEME_CSS.match(/--on-event-ink:\s*(#[0-9a-fA-F]{3,8});/)[1];

describe("status hue distance", () => {
  it("reads the four built-in palettes in both modes", () => {
    const ids = palettes().map(({ id, mode }) => `${id}-${mode}`);
    expect(ids).toEqual([
      "calvin-light",
      "calvin-dark",
      "ocean-light",
      "ocean-dark",
      "forest-light",
      "forest-dark",
      "sunset-light",
      "sunset-dark",
    ]);
  });

  for (const { id, mode, vars } of palettes()) {
    for (const [first, second, minimum] of RULES) {
      it(`${id} ${mode}: ${first} is at least ${minimum}° from ${second}`, () => {
        // Rounding matches the audit's whole-degree report.
        expect(Math.round(distance(vars[first], vars[second]))).toBeGreaterThanOrEqual(minimum);
      });
    }
  }
});

describe("calendar palette", () => {
  for (const { id, mode, vars } of palettes()) {
    it(`${id} ${mode}: event-1…8 clear AA on the chip ink`, () => {
      const ink = parse(ON_EVENT_INK);
      for (let i = 1; i <= 8; i += 1) {
        const value = vars[`event-${i}`];
        expect(value, `--event-${i} missing`).toBeTruthy();
        expect(contrast(parse(value), ink), `--event-${i}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
