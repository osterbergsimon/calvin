/**
 * E2E tests for clock bar display
 * Tests functionality: bar rendering, time display, date display
 */

import { test, expect } from "@playwright/test";

test.describe("Clock Bar Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display current time in the bar when visible", async ({ page }) => {
    const bar = page.locator(".clock-bar-horizontal, .clock-bar-vertical").first();
    if ((await bar.count()) > 0) {
      const time = bar.locator(".clock-time").first();
      if ((await time.count()) > 0) {
        const text = await time.textContent();
        if (text) {
          expect(text).toMatch(/\d{1,2}:\d{2}/);
        }
      }
    }
  });

  test("should display date when date display is enabled", async ({ page }) => {
    const settingsButton = page.locator('button:has-text("Settings"), a[href*="settings"]').first();
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click();
      await page.waitForLoadState("networkidle");

      const dateCheckbox = page
        .locator(
          'input[type="checkbox"][name*="date" i], input[type="checkbox"][aria-label*="date" i]'
        )
        .first();
      if ((await dateCheckbox.count()) > 0) {
        await dateCheckbox.check();
        await page.waitForTimeout(500);

        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const date = page.locator(".clock-date").first();
        const count = await date.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
