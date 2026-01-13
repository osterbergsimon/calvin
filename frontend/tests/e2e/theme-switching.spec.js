/**
 * E2E tests for theme switching
 * Tests functionality: manual theme toggle, theme mode changes
 */

import { test, expect } from "@playwright/test";

test.describe("Theme Switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load
    await page.waitForLoadState("networkidle");
  });

  test("should apply dark theme class to HTML element", async ({ page }) => {
    // Navigate to settings
    await page.click('button:has-text("Settings"), a[href*="settings"]');
    await page.waitForLoadState("networkidle");

    // Find theme mode selector and change to dark
    const themeSelector = page
      .locator('select[name*="theme"], select[aria-label*="theme" i]')
      .first();
    if ((await themeSelector.count()) > 0) {
      await themeSelector.selectOption("dark");
      await page.waitForTimeout(500); // Wait for theme to apply

      // Check if HTML element has dark class
      const htmlElement = page.locator("html");
      await expect(htmlElement).toHaveClass(/dark/);
    }
  });

  test("should apply light theme class to HTML element", async ({ page }) => {
    // Navigate to settings
    await page.click('button:has-text("Settings"), a[href*="settings"]');
    await page.waitForLoadState("networkidle");

    // Find theme mode selector and change to light
    const themeSelector = page
      .locator('select[name*="theme"], select[aria-label*="theme" i]')
      .first();
    if ((await themeSelector.count()) > 0) {
      await themeSelector.selectOption("light");
      await page.waitForTimeout(500); // Wait for theme to apply

      // Check if HTML element has light class
      const htmlElement = page.locator("html");
      await expect(htmlElement).toHaveClass(/light/);
    }
  });

  test("should persist theme selection", async ({ page }) => {
    // Navigate to settings
    await page.click('button:has-text("Settings"), a[href*="settings"]');
    await page.waitForLoadState("networkidle");

    // Change theme to dark
    const themeSelector = page
      .locator('select[name*="theme"], select[aria-label*="theme" i]')
      .first();
    if ((await themeSelector.count()) > 0) {
      await themeSelector.selectOption("dark");
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Verify theme is still dark
      const htmlElement = page.locator("html");
      await expect(htmlElement).toHaveClass(/dark/);
    }
  });
});
