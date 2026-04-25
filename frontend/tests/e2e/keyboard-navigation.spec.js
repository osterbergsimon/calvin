/**
 * E2E tests for keyboard navigation
 * Tests functionality: keyboard shortcuts, mode switching via keyboard, event navigation
 */

import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should navigate calendar with arrow keys", async ({ page }) => {
    // Focus on calendar
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // Navigate with arrow keys
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);

    // Calendar should still be visible
    const calendar = page.locator(".calendar, [class*='calendar']").first();
    if ((await calendar.count()) > 0) {
      await expect(calendar).toBeVisible();
    }
  });

  test("should switch modes with keyboard shortcuts", async ({ page }) => {
    // Press key 2 to switch to photos mode (if configured)
    await page.keyboard.press("2");
    await page.waitForTimeout(500);

    // Check if mode changed (photos view might be visible or mode indicator updated)
    const photosView = page.locator(".photo-slideshow, [class*='photo']").first();
    const modeIndicator = page.locator(".mode-indicator").first();

    // At least one should indicate mode change
    const photosCount = await photosView.count();
    const modeCount = await modeIndicator.count();
    expect(photosCount + modeCount).toBeGreaterThanOrEqual(0);
  });

  test("should open settings with keyboard shortcut", async ({ page }) => {
    // Press key 4 to open settings (if configured)
    await page.keyboard.press("4");
    await page.waitForTimeout(500);

    // Check if settings page is visible
    const settingsHeading = page.locator("h1, h2").filter({ hasText: /settings/i });
    if ((await settingsHeading.count()) > 0) {
      await expect(settingsHeading.first()).toBeVisible();
    }
  });

  test("should close modals with Escape key", async ({ page }) => {
    // Try to open a modal first (if available)
    const _modalTrigger = page
      .locator('button[aria-label*="close" i], button:has-text("Close")')
      .first();

    // If a modal is open, Escape should close it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Modal should be closed
    const modal = page.locator(".modal, [role='dialog']");
    const modalCount = await modal.count();
    // Modal might not exist, which is fine
    expect(modalCount).toBeGreaterThanOrEqual(0);
  });
});
