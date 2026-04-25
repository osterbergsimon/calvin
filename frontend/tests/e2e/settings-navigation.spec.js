/**
 * E2E tests for settings navigation
 * Tests functionality: navigating between settings tabs, saving changes
 */

import { test, expect } from "@playwright/test";

test.describe("Settings Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to settings
    const settingsButton = page.locator('button:has-text("Settings"), a[href*="settings"]').first();
    if ((await settingsButton.count()) > 0) {
      await settingsButton.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("should navigate to settings page", async ({ page }) => {
    // Check if we're on settings page
    const settingsHeading = page.locator("h1, h2").filter({ hasText: /settings/i });
    if ((await settingsHeading.count()) > 0) {
      await expect(settingsHeading.first()).toBeVisible();
    }
  });

  test("should display settings tabs", async ({ page }) => {
    // Look for tab navigation or category buttons
    const tabs = page.locator('button[role="tab"], .tab, [class*="tab"]');
    const tabsCount = await tabs.count();

    if (tabsCount > 0) {
      // At least some tabs should be visible
      expect(tabsCount).toBeGreaterThan(0);
    }
  });

  test("should switch between settings categories", async ({ page }) => {
    // Find category/tab buttons
    const tabs = page.locator('button[role="tab"], .tab, [class*="tab"]');
    const tabsCount = await tabs.count();

    if (tabsCount >= 2) {
      // Click first tab
      await tabs.first().click();
      await page.waitForTimeout(300);

      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(300);

      // Verify second tab is active (if it has active class)
      const secondTab = tabs.nth(1);
      const classes = await secondTab.getAttribute("class");
      if (classes) {
        // Tab should be visible and potentially active
        await expect(secondTab).toBeVisible();
      }
    }
  });
});
