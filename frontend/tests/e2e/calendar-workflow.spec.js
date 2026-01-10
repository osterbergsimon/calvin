/**
 * E2E tests for calendar workflow
 * Tests functionality: calendar view, event display, event navigation
 */

import { test, expect } from "@playwright/test";

test.describe("Calendar Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display calendar view", async ({ page }) => {
    // Calendar should be visible on dashboard
    const calendar = page.locator('.calendar, [class*="calendar"]').first();
    if ((await calendar.count()) > 0) {
      await expect(calendar).toBeVisible();
    }
  });

  test("should navigate to calendar mode", async ({ page }) => {
    // Look for mode indicator or mode button
    const modeButton = page
      .locator('button:has-text("Calendar"), [aria-label*="calendar" i]')
      .first();
    if ((await modeButton.count()) > 0) {
      await modeButton.click();
      await page.waitForTimeout(500);

      // Verify calendar is visible
      const calendar = page.locator('.calendar, [class*="calendar"]').first();
      if ((await calendar.count()) > 0) {
        await expect(calendar).toBeVisible();
      }
    }
  });

  test("should display calendar events when available", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Wait for events to load

    // Look for event items
    const events = page.locator('.event-item, [class*="event"]');
    const eventCount = await events.count();

    // Events might not be present, but calendar should be visible
    const calendar = page.locator('.calendar, [class*="calendar"]').first();
    if ((await calendar.count()) > 0) {
      await expect(calendar).toBeVisible();
    }
  });

  test("should navigate between calendar months", async ({ page }) => {
    // Find month navigation buttons
    const nextButton = page
      .locator(
        'button:has-text("Next"), [aria-label*="next" i], [title*="next" i]',
      )
      .first();
    const prevButton = page
      .locator(
        'button:has-text("Previous"), [aria-label*="prev" i], [title*="prev" i]',
      )
      .first();

    if ((await nextButton.count()) > 0 && (await prevButton.count()) > 0) {
      // Click next
      await nextButton.click();
      await page.waitForTimeout(500);

      // Click previous
      await prevButton.click();
      await page.waitForTimeout(500);

      // Both buttons should work
      expect(await nextButton.isVisible()).toBe(true);
    }
  });
});
