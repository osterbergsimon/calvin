/**
 * Accessibility audit for the UI gallery (docs/design/frontend-doctrine.md §3).
 *
 * The gallery is the reference every builder copies from, so every block state
 * it renders — including the open dialog — must pass the same axe gate as the
 * app screens.
 */
import { expect } from "@playwright/test";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { THEMES, VIEWPORTS } from "./fixtures/viewports.js";

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: ui gallery`, () => {
      test.use({ viewport: viewport.size });

      test("every block and the dialog are accessible", async ({
        page,
        consoleErrors,
      }, testInfo) => {
        await page.goto(`/ui-gallery.html?theme=${theme}`);
        await expect(page.locator('[data-test="ui-gallery"]')).toBeVisible();

        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ui gallery`);

        // The new floating blocks in their open states: menu, explainer and
        // the compact ColourField picker.
        await page.locator('[data-test="gallery-menu-trigger"]').click();
        await expect(page.getByRole("menu")).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ui gallery menu`);
        await page.keyboard.press("Escape");

        await page.locator('[data-test="gallery-popover-trigger"]').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ui gallery popover`);
        await page.keyboard.press("Escape");

        await page.locator('[data-test="gallery-colour-field"] .colour-field__trigger').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(
          page,
          testInfo,
          `${viewport.name}/${theme}: ui gallery colour field`
        );
        await page.keyboard.press("Escape");

        await page.locator('[data-test="open-dialog"]').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ui gallery dialog`);

        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
        await page.locator('[data-test="open-confirm"]').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ui gallery confirm`);

        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
