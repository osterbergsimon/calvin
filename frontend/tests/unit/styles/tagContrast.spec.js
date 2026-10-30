/**
 * Tag contrast contract.
 *
 * Tag text is 12px, so it needs WCAG AA (4.5:1) against every surface it can
 * sit on. The tone text is `color-mix(in srgb, var(--tone) var(--tag-ink),
 * var(--ink))` over `color-mix(in srgb, var(--tone) var(--tag-tint),
 * transparent)`. This reads the shipped theme variables and the real token
 * values, so a new built-in theme cannot quietly dim a tag.
 */
import { describe, it, expect } from "vitest";
import { THEMES, parse, contrast, mix, over, percentage } from "./contrast";

const TINT = percentage("--tag-tint");
const INK = percentage("--tag-ink");

const surfaces = ["bg-0", "bg-1", "bg-2"];
const tones = ["ok", "warn", "err", "focus"];

describe("Tag contrast across every built-in theme", () => {
  for (const [id, theme] of Object.entries(THEMES)) {
    for (const mode of ["variables", "dark_mode"]) {
      const vars = theme[mode];
      if (!vars) continue;

      it(`${id}${mode === "dark_mode" ? " dark mode" : ""} clears 4.5:1`, () => {
        for (const surface of surfaces) {
          const bg = parse(vars[surface]);
          // Neutral: --ink-2 on the surface.
          expect(
            contrast(parse(vars["ink-2"]), bg),
            `neutral on ${surface}`
          ).toBeGreaterThanOrEqual(4.5);
          for (const tone of tones) {
            const colour = parse(vars[tone]);
            const text = mix(colour, parse(vars.ink), INK);
            const tinted = over(colour, TINT, bg);
            expect(contrast(text, tinted), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it("derives the token values it tests", () => {
    expect(TINT).toBeGreaterThan(0);
    expect(INK).toBeGreaterThan(0);
    expect(INK).toBeLessThan(1);
  });
});
