/**
 * E2E tests for background (backend-type) plugins.
 *
 * The plugin type is still "backend" in the API; the UI and its filter call the
 * kind "Background" (CLV-63). The filter only appears when a background plugin
 * is installed, so these tests serve one from the mocked backend.
 *
 * Everything is answered by the mocked backend, so the suite runs without a
 * Calvin server and never reaches a real one.
 */

import { test, expect } from "@playwright/test";
import { installApiMock, samplePlugins } from "./phone/fixtures/api-mock.js";
import { gotoSettings } from "./phone/fixtures/navigation.js";

const backgroundPlugin = {
  id: "imap-background",
  name: "Mail watcher",
  type: "backend",
  version: "1.0.0",
  enabled: true,
  description: "Checks a mailbox in the background and posts new mail as events.",
  display_schema: null,
};

/** Serve the sample plugin catalogue plus one background plugin. */
const withBackgroundPlugin = [
  [
    /^\/api\/plugins$/,
    (route, { method, url }) => {
      if (method !== "GET") return false;
      const type = url.searchParams.get("plugin_type");
      const plugins = [...samplePlugins, backgroundPlugin].filter(
        plugin => !type || plugin.type === type
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plugins }),
      });
    },
  ],
];

test.describe("Backend Plugins", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMock(page, { overrides: withBackgroundPlugin });
    await gotoSettings(page, "Plugins");
    await expect(page.locator(".plugins-category")).toBeVisible();
  });

  const kindFilter = page => page.locator('[role="radiogroup"][aria-label="Plugin kind"]');

  test("should display background tab in plugin manager", async ({ page }) => {
    await expect(
      kindFilter(page).getByRole("radio", { name: "Background", exact: true })
    ).toBeVisible();
  });

  test("should show background plugins when background tab is active", async ({ page }) => {
    await kindFilter(page).getByRole("radio", { name: "Background", exact: true }).click();

    const card = page.locator('[data-plugin-id="imap-background"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("Works in the background");
    // Only background plugins remain in the list.
    await expect(page.locator('[data-plugin-id="mealie"]')).toHaveCount(0);
  });

  test("should label the background kind in plain words", async ({ page }) => {
    await kindFilter(page).getByRole("radio", { name: "Background", exact: true }).click();

    const card = page.locator('[data-plugin-id="imap-background"]');
    await expect(card.locator(".pc-badge")).toHaveText("Background");
    await expect(card).not.toContainText("backend");
  });

  test("should filter plugins by background type", async ({ page }) => {
    const filter = kindFilter(page);
    await filter.getByRole("radio", { name: "All", exact: true }).click();
    await expect(page.locator('[data-plugin-id="imap-background"]')).toBeVisible();
    await expect(page.locator('[data-plugin-id="mealie"]')).toBeVisible();

    await filter.getByRole("radio", { name: "Background", exact: true }).click();
    await expect(page.locator('[data-plugin-id="imap-background"]')).toBeVisible();
    await expect(page.locator('[data-plugin-id="mealie"]')).toHaveCount(0);
  });
});
