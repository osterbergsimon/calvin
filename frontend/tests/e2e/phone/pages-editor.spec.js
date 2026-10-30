/**
 * CLV-66 — the pages editor on a phone (CLV-47).
 *
 * The editor is the densest screen in Settings: page tabs, a scaled device
 * preview, and an inspector that becomes a bottom sheet. This walks it at
 * 390x844 and audits the stage, the open sheet and an added page.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("phone: pages editor opens, edits a region and adds a page", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page);
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Screens");
  await page.locator('[data-test="screen-default-card"]').click();
  await page.locator('[data-test="default-edit-pages-btn"]').click();

  const editor = page.locator(".sre-root");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("tab")).toHaveCount(2);
  await expect(editor.getByRole("tab", { name: /Home/ })).toHaveAttribute("aria-selected", "true");
  // The phone layout uses the sheet peek, not the desktop rail.
  await expect(editor.locator('[data-test="sheet-peek"]')).toBeVisible();
  await expectPhoneLayout(page, "pages editor", { settleMs: 2000 });

  // Tapping a region opens the inspector sheet for it.
  await editor.locator(".sre-region").first().click();
  const sheet = editor.locator(".sre-rail.is-open");
  await expect(sheet).toBeVisible();
  await expect(editor.locator('[data-test="sheet-selection"]')).toContainText("Region");
  await expectPhoneLayout(page, "region inspector sheet", { scope: ".sre-rail.is-open" });

  // Collapsing the sheet returns the full stage, all still reachable.
  await editor.locator('[data-test="sheet-peek"]').click();
  await expect(editor.locator(".sre-rail.is-open")).toHaveCount(0);
  await expect(editor.locator(".sre-rail.is-sheet")).toHaveCSS("height", "64px");
  await expectPhoneLayout(page, "pages editor with the sheet collapsed", { settleMs: 2000 });

  // Switch pages, then add one; both keep the strip usable on a phone.
  await editor.getByRole("tab", { name: /Kitchen/ }).click();
  await expect(editor.getByRole("tab", { name: /Kitchen/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expectPhoneLayout(page, "pages editor on the Kitchen page", { settleMs: 2000 });

  await editor.getByRole("button", { name: "Add page" }).click();
  await expect(editor.getByRole("tab")).toHaveCount(3);
  await expect(editor.locator(".sre-rail.is-sheet")).toHaveCSS("height", "64px");
  await expectPhoneLayout(page, "pages editor after adding a page", { settleMs: 2000 });
  await expect.poll(() => api.requests).toContain("POST /api/config");

  // Previewing on a screen is a phone-relevant control in the context strip.
  await editor.getByRole("button", { name: "Preview on screen" }).click();
  await expect(page.locator(".pill__panel")).toBeVisible();
  await expectPhoneLayout(page, "preview-on chooser", { scope: ".pill__panel" });
  await page.keyboard.press("Escape");

  await editor.getByRole("button", { name: "Close editor" }).click();
  await expect(editor).toBeHidden();

  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
