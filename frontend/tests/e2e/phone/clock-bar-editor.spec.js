/**
 * The clock bar editor on a phone (docs/design/2026-11-04-clock-bar-editor.md).
 *
 * Opens the popup from Dashboard, moves a part with the non-drag Order buttons,
 * hides a part from the rail, saves live and proves the design survives a
 * reload. The phone layout keeps the rail as a bottom sheet.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const openEditor = async page => {
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Dashboard");
  await page.locator('[data-test="edit-clock-bar"]').click();
  const editor = page.locator(".cbe-root");
  await expect(editor).toBeVisible();
  return editor;
};

test.describe("phone: clock bar editor", () => {
  test("opens, moves and hides parts, saves and survives a reload", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page);
    const editor = await openEditor(page);

    await expect(editor.locator(".clock-bar-horizontal")).toBeVisible();
    await expect(editor.locator(".cbe-shelf")).toBeVisible();
    await expectPhoneLayout(page, "clock bar editor", { scope: ".cbe-root", settleMs: 1600 });

    // Move Time from the Centre zone to the Right zone with the keyboard/touch
    // alternative to drag.
    await editor.locator('[data-drop-zone="center"] [data-part-id="time"]').click();
    await editor.getByRole("button", { name: "Move Time later" }).click();
    await expect
      .poll(() => api.config.clockBarDesign?.horizontal?.zones?.right || [])
      .toContain("time");

    // Hide the logo by switching Show off in the rail.
    await editor.locator('[data-drop-zone="left"] [data-part-id="logo"]').click();
    await editor.getByLabel("Show Calvin logo").click();
    await expect.poll(() => api.config.clockBarDesign?.horizontal?.hidden || []).toContain("logo");
    await expect.poll(() => api.configPosts.length).toBeGreaterThan(0);

    await editor.locator('[data-test="clock-bar-done"]').click();
    await expect(editor).toBeHidden();

    // Reload from the mock's saved config and reopen: the design persisted.
    const reopened = await openEditor(page);
    await expect(reopened.locator('.cbe-shelf [data-part-id="logo"]')).toBeVisible();
    await expect(reopened.locator('[data-drop-zone="right"] [data-part-id="time"]')).toBeVisible();
    await expectPhoneLayout(page, "clock bar editor after reload", {
      scope: ".cbe-root",
      settleMs: 1600,
    });

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
