/**
 * Reduced-motion contract (CLV-65).
 *
 * A kiosk runs for weeks and people with vestibular sensitivity still use it.
 * base.css carries one global `prefers-reduced-motion` rule; this proves it
 * actually reaches every element on the real screens — not just the ones whose
 * components remembered to opt in.
 *
 * One deliberate exception (CLV-115): the Pulse loading light *is* the
 * reduced-motion style, a slow low-opacity fade, so it keeps breathing. It is
 * marked `data-reduced-motion-exempt`; nothing else may be.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings } from "../phone/fixtures/navigation.js";
import { test } from "./fixtures/axe-audit.js";
import { VIEWPORTS } from "./fixtures/viewports.js";

const MOVING = page =>
  page.evaluate(() => {
    const offenders = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.hasAttribute("data-reduced-motion-exempt")) continue;
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
  });

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

    test("the Pulse loading light is the only exemption, and it still pulses", async ({ page }) => {
      await emulateReducedMotion(page);
      await installApiMock(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const exempt = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-reduced-motion-exempt]"), el => {
          const style = getComputedStyle(el);
          return {
            className: String(el.className || ""),
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            iterations: style.animationIterationCount,
            transition: parseFloat(style.transitionDuration) || 0,
          };
        })
      );
      // The forced Pulse lights are always mounted (inactive) on the dashboard.
      expect(exempt.length).toBeGreaterThan(0);
      for (const entry of exempt) {
        expect(entry.className).toBe("pulse__ring");
        expect(entry.animationDuration).toBe("2.4s");
        expect(entry.iterations).toBe("infinite");
        expect(entry.transition).toBeLessThanOrEqual(0.01);
      }
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
