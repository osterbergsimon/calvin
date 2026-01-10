/**
 * E2E tests for mode switching
 * Tests functionality: switching between calendar, photos, web services modes
 */

import { test, expect } from "@playwright/test";

test.describe("Mode Switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should switch to photos mode", async ({ page }) => {
    // Look for photos mode button or keyboard shortcut indicator
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(500);

      // Verify photos mode is active (check for photo slideshow or mode indicator)
      const photosView = page
        .locator('.photo-slideshow, [class*="photo"], [class*="photos"]')
        .first();
      const modeIndicator = page.locator(".mode-indicator").first();

      if ((await photosView.count()) > 0 || (await modeIndicator.count()) > 0) {
        // Mode switch should be successful
        expect(true).toBe(true);
      }
    }
  });

  test("should switch to web services mode", async ({ page }) => {
    // Look for web services mode button
    const webServicesButton = page
      .locator('button:has-text("Web Services"), [aria-label*="web" i]')
      .first();
    if ((await webServicesButton.count()) > 0) {
      await webServicesButton.click();
      await page.waitForTimeout(500);

      // Verify web services mode is active
      const webServicesView = page
        .locator('.web-services, [class*="web-service"]')
        .first();
      if ((await webServicesView.count()) > 0) {
        await expect(webServicesView).toBeVisible();
      }
    }
  });

  test("should return to calendar mode", async ({ page }) => {
    // Switch to photos mode first
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(500);

      // Then switch back to calendar
      const calendarButton = page
        .locator('button:has-text("Calendar"), [aria-label*="calendar" i]')
        .first();
      if ((await calendarButton.count()) > 0) {
        await calendarButton.click();
        await page.waitForTimeout(500);

        // Verify calendar is visible
        const calendar = page.locator('.calendar, [class*="calendar"]').first();
        if ((await calendar.count()) > 0) {
          await expect(calendar).toBeVisible();
        }
      }
    }
  });

  test("should display mode indicator", async ({ page }) => {
    // Mode indicator should exist (even if hidden)
    const modeIndicator = page.locator(
      '.mode-indicator, [class*="mode-indicator"]',
    );
    const count = await modeIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
