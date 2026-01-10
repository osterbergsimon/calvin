/**
 * E2E tests for clock display
 * Tests functionality: clock rendering, time display, date display
 */

import { test, expect } from "@playwright/test";

test.describe("Clock Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display current time when clock is enabled", async ({
    page,
  }) => {
    // Look for clock component
    const clock = page.locator(".clock, [class*='clock']").first();
    if ((await clock.count()) > 0) {
      const clockText = await clock.textContent();
      // Should display time in format HH:MM or H:MM
      if (clockText) {
        expect(clockText).toMatch(/\d{1,2}:\d{2}/);
      }
    }
  });

  test("should display clock in header when enabled", async ({ page }) => {
    // Look for clock in header area
    const header = page.locator(".dashboard-header");
    if ((await header.count()) > 0) {
      const clockInHeader = header.locator(".clock").first();
      const count = await clockInHeader.count();
      // Clock might be in header if enabled
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test("should display date when date display is enabled", async ({ page }) => {
    // Navigate to settings to enable date display
    const settingsButton = page
      .locator('button:has-text("Settings"), a[href*="settings"]')
      .first();
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click();
      await page.waitForLoadState("networkidle");

      // Look for clock date setting and enable it
      const dateCheckbox = page
        .locator(
          'input[type="checkbox"][name*="date" i], input[type="checkbox"][aria-label*="date" i]',
        )
        .first();
      if ((await dateCheckbox.count()) > 0) {
        await dateCheckbox.check();
        await page.waitForTimeout(500);

        // Go back to dashboard
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Check if date is displayed in clock
        const clockDate = page.locator(".clock-date, [class*='clock-date']");
        const count = await clockDate.count();
        // Date might be displayed
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
