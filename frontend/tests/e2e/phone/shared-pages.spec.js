/**
 * calvin-m4rg — a page added on a screen stays on that screen.
 *
 * Runs on the mocked harness: every /api call is answered by page.route, so no
 * host-acting route can ever reach a real Calvin.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import {
  PHONE,
  closeSection,
  expectSettingsReady,
  gotoSettings,
  openSection,
  selectCategory,
} from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("adding a page on a screen pins Default and gives only that screen the page", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page, {
    config: { availableScreens: null },
  });
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Screens");

  // Open the editor from the first screen (Hallway), not from Default.
  await page.locator('[data-test="screen-card"]').first().click();
  await openSection(page, "screen-pages");
  await page.locator('[data-test="edit-pages-btn"]').click();
  const editor = page.locator(".sre-root");
  await expect(editor).toBeVisible();

  await editor.getByRole("button", { name: "Add page" }).click();

  // Catalog first, then the screen's list.
  await expect.poll(() => api.requests).toContain("POST /api/config");
  await expect.poll(() => api.requests).toContain("PUT /api/kiosks/hallway/overrides");
  const configPost = api.requests.indexOf("POST /api/config");
  const listPut = api.requests.indexOf("PUT /api/kiosks/hallway/overrides");
  expect(configPost).toBeLessThan(listPut);

  // Default is pinned to the pages that existed before, so it does not absorb
  // the newcomer.
  expect(api.config.availableScreens).toEqual(["page-home", "page-kitchen"]);
  const added = api.config.dashboardScreens.screens.find(screen => screen.name === "Page 3");
  expect(added).toBeTruthy();
  expect(api.overridesByKiosk.hallway.availableScreens).toEqual([
    "page-home",
    "page-kitchen",
    added.id,
  ]);
  // The other screen still follows Default and did not gain the page.
  expect(api.overridesByKiosk.workshop).toBeUndefined();

  // Default's page lists every catalog page, with the newcomer switched off.
  await page.getByRole("button", { name: "Close editor" }).click();
  await closeSection(page);
  await page.locator('.settings-topbar [data-action="back"]').click();
  await page.locator('[data-test="screen-default-card"]').click();
  await openSection(page, "default-pages");
  const rows = page.locator('[data-test="default-page-row"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).locator('[role="switch"]')).toHaveAttribute("aria-checked", "false");

  expect(api.hostActions).toEqual([]);
  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
