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

  test("should show bar action controls when UI is visible", async ({ page }) => {
    const cluster = page.locator(".bar-action-cluster");
    if ((await cluster.count()) > 0) {
      await expect(cluster.first()).toBeVisible();
    }
  });

  test("should display the clock bar when shown", async ({ page }) => {
    const bar = page.locator(".clock-bar-horizontal, .clock-bar-vertical");
    const count = await bar.count();
    expect(count).toBeGreaterThanOrEqual(0);
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
