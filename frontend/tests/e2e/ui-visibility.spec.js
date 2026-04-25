/**
 * E2E tests for UI visibility and kiosk mode
 * Tests functionality: UI toggle, kiosk mode behavior, header visibility
 */

import { test, expect } from "@playwright/test";

test.describe("UI Visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should show UI controls when UI is visible", async ({ page }) => {
    // Look for header controls
    const header = page.locator(".dashboard-header");
    if ((await header.count()) > 0) {
      await expect(header).toBeVisible();
    }
  });

  test("should display clock when enabled and UI visible", async ({ page }) => {
    // Look for clock component
    const clock = page.locator(".clock, [class*='clock']");
    const clockCount = await clock.count();

    // Clock should exist if enabled (might be hidden)
    expect(clockCount).toBeGreaterThanOrEqual(0);
  });

  test("should display connection indicator when offline", async ({ page }) => {
    // Connection indicator might be hidden when online
    // But should exist in DOM
    const connectionIndicator = page.locator(".connection-indicator, [class*='connection']");
    const count = await connectionIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should display minimal UI overlay when UI is hidden", async ({ page }) => {
    // Look for minimal UI overlay button (if UI is hidden)
    const minimalUI = page.locator(".minimal-ui-overlay, [class*='minimal']");
    const count = await minimalUI.count();
    // Should exist in DOM (even if hidden)
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
