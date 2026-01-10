/**
 * Example E2E test
 * This demonstrates the basic structure for E2E tests
 */

import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("should load dashboard page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Calvin/i);
  });
});
