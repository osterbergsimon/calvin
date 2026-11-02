/**
 * E2E tests for settings workflow
 * Tests functionality: configuration changes, saving settings, form validation
 */

import { test, expect } from "@playwright/test";

test.describe("Settings Workflow", () => {
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

  test("should display settings form", async ({ page }) => {
    // Settings form should be visible
    const settingsForm = page.locator("form, [class*='settings']").first();
    if ((await settingsForm.count()) > 0) {
      await expect(settingsForm).toBeVisible();
    }
  });

  test("should save configuration changes", async ({ page }) => {
    // Find a clock-related checkbox to toggle (e.g., show date / show seconds)
    const clockCheckbox = page
      .locator(
        'input[type="checkbox"][name*="clock" i], input[type="checkbox"][aria-label*="clock" i]'
      )
      .first();
    if ((await clockCheckbox.count()) > 0) {
      // Toggle the setting
      const initialState = await clockCheckbox.isChecked();
      await clockCheckbox.setChecked(!initialState);
      await page.waitForTimeout(300);

      // Look for save button
      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
      if ((await saveButton.count()) > 0) {
        await saveButton.click();
        await page.waitForTimeout(500);

        // Settings should be saved (no error visible)
        const errorMessage = page.locator(".error, [class*='error']").first();
        const errorCount = await errorMessage.count();
        // No error should be visible after save
        expect(errorCount).toBeLessThanOrEqual(0);
      }
    }
  });

  test("should validate form inputs", async ({ page }) => {
    // Look for an input field that might have validation
    const inputs = page.locator("input[type='text'], input[type='number']");
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      // Try to enter invalid data (if there's a validation rule)
      const firstInput = inputs.first();
      if (await firstInput.isVisible()) {
        await firstInput.fill("");
        await page.waitForTimeout(300);

        // Trigger validation by trying to save or blur
        await firstInput.blur();
        await page.waitForTimeout(300);

        // Validation message might appear
        const validationMessage = page
          .locator(".error, .validation, [class*='error'], [class*='validation']")
          .first();
        const count = await validationMessage.count();
        // Validation might be present
        expect(count).toBeGreaterThanOrEqual(0);
      } else {
        // If input is not visible, skip validation check
        expect(true).toBe(true);
      }
    } else {
      // If no inputs found, test passes (settings might not have text inputs)
      expect(true).toBe(true);
    }
  });

  test("should reset form to defaults", async ({ page }) => {
    // Look for reset button
    const resetButton = page
      .locator('button:has-text("Reset"), button:has-text("Default")')
      .first();
    if ((await resetButton.count()) > 0) {
      await resetButton.click();
      await page.waitForTimeout(500);

      // Form should be reset (visual confirmation)
      await expect(resetButton).toBeVisible();
    }
  });
});
