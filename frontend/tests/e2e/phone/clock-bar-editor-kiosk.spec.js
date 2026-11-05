/**
 * The clock bar editor on the 800x480 touch kiosk (cog/WebKit class hardware).
 *
 * At this size the editor uses its compact two-part layout: the stage above the
 * inspector. The same non-drag controls work, the design saves live and the
 * reload keeps it.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import {
  KIOSK,
  KIOSK_ID,
  gotoSettings,
  expectSettingsReady,
  selectCategory,
} from "./fixtures/navigation.js";

test.use({ viewport: KIOSK, hasTouch: true, isMobile: false });

const openEditor = async page => {
  await gotoSettings(page, null, { kiosk: KIOSK_ID });
  await expectSettingsReady(page);
  await selectCategory(page, "Dashboard");
  await page.locator('[data-test="edit-clock-bar"]').click();
  const editor = page.locator(".cbe-root");
  await expect(editor).toBeVisible();
  return editor;
};

test("kiosk: edit the clock bar at 800x480 and keep it after a reload", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page);
  const editor = await openEditor(page);

  await expect(editor.locator(".clock-bar-horizontal")).toBeVisible();
  await expect(editor).toHaveClass(/size-compact/);
  await expectPhoneLayout(page, "kiosk clock bar editor", {
    scope: ".cbe-root",
    settleMs: 1600,
  });

  // Show the date from the Not shown shelf.
  await editor.locator('.cbe-shelf [data-part-id="date"]').click();
  await editor.getByLabel("Show Date").click();
  await expect
    .poll(() => api.config.clockBarDesign?.horizontal?.zones?.center || [])
    .toContain("date");

  // Hide the logo.
  await editor.locator('[data-drop-zone="left"] [data-part-id="logo"]').click();
  await editor.getByLabel("Show Calvin logo").click();
  await expect.poll(() => api.config.clockBarDesign?.horizontal?.hidden || []).toContain("logo");
  await expect.poll(() => api.configPosts.length).toBeGreaterThan(0);

  await editor.locator('[data-test="clock-bar-done"]').click();
  await expect(editor).toBeHidden();

  const reopened = await openEditor(page);
  await expect(reopened.locator('.cbe-shelf [data-part-id="logo"]')).toBeVisible();
  await expect(reopened.locator('[data-drop-zone="center"] [data-part-id="date"]')).toBeVisible();
  await expectPhoneLayout(page, "kiosk clock bar editor after reload", {
    scope: ".cbe-root",
    settleMs: 1600,
  });

  expect(api.hostActions).toEqual([]);
  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
