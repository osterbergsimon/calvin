/**
 * Reduced-motion contract (CLV-65).
 *
 * A kiosk runs for weeks and people with vestibular sensitivity still use it.
 * base.css carries one global `prefers-reduced-motion` rule; this proves it
 * actually reaches every element on the real screens — not just the ones whose
 * components remembered to opt in.
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

    test("Settings transitions are effectively off", async ({ page }) => {
      await emulateReducedMotion(page);
      await installApiMock(page);
      await gotoSettings(page);
      await expectSettingsReady(page);
      expect(await MOVING(page)).toEqual([]);
    });
  });
}
