/**
 * Reduced-motion contract (CLV-65).
 *
 * A kiosk runs for weeks and people with vestibular sensitivity still use it.
 * base.css carries one global `prefers-reduced-motion` rule; this proves it
 * actually reaches every element on the real screens — not just the ones whose
 * components remembered to opt in.
 *
 * One deliberate exception (CLV-115, docs/design/2026-11-01-loading-light.md):
 * the Pulse loading light *is* the reduced-motion style, a slow low-opacity
 * fade, so an ACTIVE Pulse ring (`.loading-indicator.is-active .pulse__ring`)
 * keeps breathing while something loads. An idle indicator must not animate;
 * nothing else is allowed.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings } from "../phone/fixtures/navigation.js";
import { test } from "./fixtures/axe-audit.js";
import { VIEWPORTS } from "./fixtures/viewports.js";

// The only element allowed to animate under reduced motion (see above).
const ACTIVE_PULSE_RING = ".loading-indicator.is-active .pulse__ring";

const MOVING = page =>
  page.evaluate(allowed => {
    const offenders = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.matches(allowed)) continue;
      const style = getComputedStyle(el);
      const durations = [
        ...style.transitionDuration.split(","),
        ...style.animationDuration.split(","),
      ].map(value => parseFloat(value) || 0);
      if (durations.some(duration => duration > 0.01)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 60),
          durations,
        });
      }
    }
    return offenders;
  }, ACTIVE_PULSE_RING);

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}: reduced motion`, () => {
    test.use({ viewport: viewport.size });

    const emulateReducedMotion = async page => {
      // Set explicitly: the `reducedMotion` fixture option is not applied by
      // the headless shell this suite runs on.
      await page.emulateMedia({ reducedMotion: "reduce" });
    };

    test("dashboard transitions are effectively off", async ({ page }) => {
      await emulateReducedMotion(page);
      await installApiMock(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      expect(await MOVING(page)).toEqual([]);
    });

    test("idle Pulse lights are still; an active one still pulses", async ({ page }) => {
      await emulateReducedMotion(page);
      await installApiMock(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const motionOf = () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll(".pulse__ring"), el => {
            const style = getComputedStyle(el);
            return {
              active: el.closest(".loading-indicator").classList.contains("is-active"),
              duration: parseFloat(style.animationDuration) || 0,
              iterations: style.animationIterationCount,
            };
          })
        );
      // The forced Pulse lights are always mounted on the dashboard.
      const idle = (await motionOf()).filter(ring => !ring.active);
      expect(idle.length).toBeGreaterThan(0);
      for (const ring of idle) expect(ring.duration).toBeLessThanOrEqual(0.01);

      // Light one up (what the engine does while something loads): only then
      // does it breathe, slowly and forever.
      await page.evaluate(() =>
        document
          .querySelector(".pulse__ring")
          .closest(".loading-indicator")
          .classList.add("is-active")
      );
      const active = (await motionOf()).filter(ring => ring.active);
      expect(active).toEqual([{ active: true, duration: 2.4, iterations: "infinite" }]);
    });

    test("Settings transitions are effectively off", async ({ page }) => {
      await emulateReducedMotion(page);
      await installApiMock(page);
      await gotoSettings(page);
      await expectSettingsReady(page);
      expect(await MOVING(page)).toEqual([]);
    });
  });
}
