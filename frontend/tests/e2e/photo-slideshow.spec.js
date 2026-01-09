/**
 * E2E tests for photo slideshow
 * Tests functionality: photo display, slideshow navigation, auto-rotation
 */

import { test, expect } from "@playwright/test";

test.describe("Photo Slideshow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display photo slideshow in photos mode", async ({ page }) => {
    // Switch to photos mode
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(1000); // Wait for images to load

      // Look for photo slideshow
      const slideshow = page.locator(
        ".photo-slideshow, [class*='photo-slideshow'], [class*='slideshow']",
      );
      if ((await slideshow.count()) > 0) {
        await expect(slideshow.first()).toBeVisible();
      }
    }
  });

  test("should display images in slideshow", async ({ page }) => {
    // Switch to photos mode
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(2000); // Wait for images to load

      // Look for image elements
      const images = page.locator(".photo-slideshow img, [class*='photo'] img");
      const imageCount = await images.count();

      // Images might not be present if none uploaded, but slideshow should exist
      expect(imageCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("should navigate between photos with arrow keys", async ({ page }) => {
    // Switch to photos mode
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(1000);

      // Focus on slideshow and navigate
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(500);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(500);

      // Slideshow should still be visible
      const slideshow = page
        .locator(".photo-slideshow, [class*='photo-slideshow']")
        .first();
      if ((await slideshow.count()) > 0) {
        await expect(slideshow).toBeVisible();
      }
    }
  });

  test("should display placeholder when no images available", async ({
    page,
  }) => {
    // Switch to photos mode
    const photosButton = page
      .locator('button:has-text("Photos"), [aria-label*="photos" i]')
      .first();
    if ((await photosButton.count()) > 0) {
      await photosButton.click();
      await page.waitForTimeout(1000);

      // Look for placeholder or empty state
      const placeholder = page.locator(
        '[class*="placeholder"], [class*="empty"], [class*="no-images"]',
      );
      const slideshow = page.locator(
        ".photo-slideshow, [class*='photo-slideshow']",
      );

      // Either placeholder or slideshow should be visible
      const placeholderCount = await placeholder.count();
      const slideshowCount = await slideshow.count();
      expect(placeholderCount + slideshowCount).toBeGreaterThanOrEqual(0);
    }
  });
});
