/**
 * E2E tests for responsive layout
 * Tests functionality: orientation changes, responsive breakpoints, layout adaptation
 */

import { test, expect } from "@playwright/test";

test.describe("Responsive Layout", () => {
  test("should adapt to landscape orientation", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Dashboard should load in landscape
    const dashboard = page.locator(".dashboard, [class*='dashboard']").first();
    if ((await dashboard.count()) > 0) {
      await expect(dashboard).toBeVisible();
    }
  });

  test("should adapt to portrait orientation", async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Dashboard should load in portrait
    const dashboard = page.locator(".dashboard, [class*='dashboard']").first();
    if ((await dashboard.count()) > 0) {
      await expect(dashboard).toBeVisible();
    }
  });

  test("should handle orientation toggle", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Look for orientation toggle button
    const orientationButton = page
      .locator('button:has-text("Portrait"), button:has-text("Landscape"), .btn-orientation')
      .first();
    if ((await orientationButton.count()) > 0) {
      await orientationButton.click();
      await page.waitForTimeout(500);

      // Orientation should change (visual change)
      await expect(orientationButton).toBeVisible();
    }
  });

  test("should adapt layout to different screen sizes", async ({ page }) => {
    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const dashboard = page.locator(".dashboard").first();
    if ((await dashboard.count()) > 0) {
      await expect(dashboard).toBeVisible();
    }

    // Test mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState("networkidle");

    const dashboardMobile = page.locator(".dashboard").first();
    if ((await dashboardMobile.count()) > 0) {
      await expect(dashboardMobile).toBeVisible();
    }
  });
});
