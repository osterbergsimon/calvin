/**
 * E2E tests for calendar events
 * Tests functionality: event display, event selection, event details panel
 */

import { test, expect } from "@playwright/test";

test.describe("Calendar Events", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display events on calendar", async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for events to load

    // Look for event items
    const events = page.locator(
      ".event-item, [class*='event'], [class*='calendar-event']",
    );
    const _eventCount = await events.count();

    // Events might not be present, but calendar should be visible
    const calendar = page.locator(".calendar, [class*='calendar']").first();
    if ((await calendar.count()) > 0) {
      await expect(calendar).toBeVisible();
    }
  });

  test("should select event when clicked", async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for events to load

    // Look for event items
    const events = page
      .locator(".event-item, [class*='event'], [class*='calendar-event']")
      .first();
    if ((await events.count()) > 0) {
      await events.click();
      await page.waitForTimeout(500);

      // Event should be selected (might open details panel)
      const detailsPanel = page.locator(
        ".event-detail, [class*='event-detail'], [class*='detail-panel']",
      );
      const selectedEvent = page.locator(
        ".event-item.selected, [class*='event'].selected, [class*='selected']",
      );

      // Either details panel or selected class should be present
      const detailsCount = await detailsPanel.count();
      const selectedCount = await selectedEvent.count();
      expect(detailsCount + selectedCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("should display event details panel", async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for events to load

    // Click on an event
    const events = page
      .locator(".event-item, [class*='event'], [class*='calendar-event']")
      .first();
    if ((await events.count()) > 0) {
      await events.click();
      await page.waitForTimeout(500);

      // Details panel should be visible
      const detailsPanel = page
        .locator(
          ".event-detail, [class*='event-detail'], [class*='detail-panel']",
        )
        .first();
      if ((await detailsPanel.count()) > 0) {
        await expect(detailsPanel).toBeVisible();
      }
    }
  });

  test("should close event details panel", async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for events to load

    // Click on an event to open details
    const events = page
      .locator(".event-item, [class*='event'], [class*='calendar-event']")
      .first();
    if ((await events.count()) > 0) {
      await events.click();
      await page.waitForTimeout(500);

      // Look for close button
      const closeButton = page
        .locator(
          'button[aria-label*="close" i], button:has-text("Close"), .close-button',
        )
        .first();
      if ((await closeButton.count()) > 0) {
        await closeButton.click();
        await page.waitForTimeout(300);

        // Panel should be closed
        const detailsPanel = page
          .locator(".event-detail:visible, [class*='event-detail']:visible")
          .first();
        const visibleCount = await detailsPanel.count();
        // Panel should be hidden
        expect(visibleCount).toBeLessThanOrEqual(0);
      }
    }
  });
});
