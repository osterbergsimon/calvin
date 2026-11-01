/**
 * CLV-66 — the 800x480 touch kiosk run.
 *
 * A wall panel is short but wide: Settings keeps its internal scroll there and
 * the "Use your phone" hand-off is shown. This walks every category, the
 * hand-off card and the pages editor at that size.
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

test("kiosk: every settings category and the phone hand-off at 800x480", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page);
  await gotoSettings(page, null, { kiosk: KIOSK_ID });
  await expectSettingsReady(page);
  // The kiosk identity marks <html>; that is what keeps 800x480 off the phone layout.
  await expect(page.locator("html")).toHaveClass(/calvin-kiosk/);
  await expectPhoneLayout(page, "Settings at 800x480");

  for (const category of ["Content", "Dashboard", "Screens", "Plugins", "System", "Security"]) {
    await selectCategory(page, category);
    await expectPhoneLayout(page, `kiosk ${category} category`);
  }

  // A touch kiosk offers the same settings on a phone.
  await selectCategory(page, "Content");
  await page.getByRole("button", { name: "Continue setup on your phone" }).click();
  const handoff = page.getByRole("dialog", { name: "Set up from your phone" });
  await expect(handoff).toBeVisible();
  await expectPhoneLayout(page, "phone hand-off card", {
    scope: '[role="dialog"][aria-label="Set up from your phone"]',
  });
  await page.getByRole("button", { name: "Close" }).click();
  await expect(handoff).toBeHidden();

  // The pages editor uses its compact (two-pane) layout at this size.
  await selectCategory(page, "Screens");
  await page.locator('[data-test="screen-default-card"]').click();
  await page.locator('[data-test="default-edit-pages-btn"]').click();
  const editor = page.locator(".sre-root");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveClass(/size-compact/);
  await expectPhoneLayout(page, "pages editor at 800x480", { settleMs: 2000 });
  await page.getByRole("button", { name: "Close editor" }).click();

  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
