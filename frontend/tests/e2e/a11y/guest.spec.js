/**
 * Share-link guest page accessibility audit (calvin-mwqo).
 *
 * The guest page follows the phone's own light/dark setting (it has no Calvin
 * theme), so each state is audited under both emulated colour schemes: the
 * ready page with photos, the upload in progress, and a dead link.
 */

import { expect } from "@playwright/test";
import { JPEG, TOKEN, installGuestMock } from "../phone/fixtures/guest-mock.js";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { expectTheme, THEMES, VIEWPORTS } from "./fixtures/viewports.js";

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: share-link guest page`, () => {
      test.use({ viewport: viewport.size, colorScheme: theme });

      test("the page, its photos and a removal confirm are accessible", async ({
        page,
        consoleErrors,
      }, testInfo) => {
        await installGuestMock(page);
        await page.goto(`/share/${TOKEN}/`);
        await expect(page.locator('[data-test="guest-add"]')).toBeVisible();
        await expectTheme(page, theme);

        const chooser = page.waitForEvent("filechooser");
        await page.locator('[data-test="guest-add"]').click();
        await (
          await chooser
        ).setFiles([
          { name: "one.jpg", mimeType: "image/jpeg", buffer: JPEG },
          { name: "two.jpg", mimeType: "image/jpeg", buffer: JPEG },
        ]);
        await expect(page.locator('[data-test="guest-thumb"]')).toHaveCount(2);
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: guest page`);

        await page.getByRole("button", { name: "Remove photo 1 of 2" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: guest remove confirm`);
        expect(consoleErrors).toEqual([]);
      });

      test("the upload progress is accessible", async ({ page }, testInfo) => {
        await installGuestMock(page);
        // Hold the upload open so the progress bar stays on screen.
        await page.route(`**/api/guest/${TOKEN}/uploads`, async route => {
          if (route.request().method() === "POST") return; // never answered
          return route.fallback();
        });
        await page.goto(`/share/${TOKEN}/`);
        await expectTheme(page, theme);
        const chooser = page.waitForEvent("filechooser");
        await page.locator('[data-test="guest-add"]').click();
        await (await chooser).setFiles([{ name: "one.jpg", mimeType: "image/jpeg", buffer: JPEG }]);
        await expect(page.getByRole("progressbar", { name: "Upload progress" })).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: guest progress`);
      });

      test("a dead link is accessible", async ({ page }, testInfo) => {
        await installGuestMock(page, { valid: false });
        await page.goto(`/share/${TOKEN}/`);
        await expect(page.locator('[data-test="guest-invalid"]')).toBeVisible();
        await expectTheme(page, theme);
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: guest dead link`);
      });
    });
  }
}
