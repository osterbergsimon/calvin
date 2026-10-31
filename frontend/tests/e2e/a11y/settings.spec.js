/**
 * Settings accessibility audit (CLV-65).
 *
 * Every category a person can reach, plus the two densest screens inside
 * Screens: one screen's own page and the pages editor. Run on the phone and
 * the kiosk, in light and dark.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings, selectCategory } from "../phone/fixtures/navigation.js";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { expectTheme, THEMES, VIEWPORTS } from "./fixtures/viewports.js";

const CATEGORIES = ["Content", "Dashboard", "Screens", "Plugins", "System", "Security"];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: settings`, () => {
      test.use({ viewport: viewport.size, colorScheme: theme });

      test("every category is accessible", async ({ page, consoleErrors }, testInfo) => {
        await installApiMock(page);
        await gotoSettings(page);
        await expectSettingsReady(page);
        await expectTheme(page, theme);

        for (const category of CATEGORIES) {
          await selectCategory(page, category);
          await expectAccessible(page, testInfo, `${viewport.name}/${theme}: ${category}`);
        }

        expect(consoleErrors).toEqual([]);
      });

      test("one screen's page and the pages editor are accessible", async ({
        page,
        consoleErrors,
      }, testInfo) => {
        await installApiMock(page);
        await gotoSettings(page);
        await expectSettingsReady(page);
        await selectCategory(page, "Screens");
        await expectTheme(page, theme);

        // One screen's own page (device overrides, display, power).
        await page.locator('[data-test="screen-card"]').first().click();
        await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: Screens / one screen`);

        // The Default screen's page, then the pages editor it opens.
        await page.locator('[data-test="screens-back"]').click();
        await page.locator('[data-test="screen-default-card"]').click();
        await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: Screens / Default`);

        await page.locator('[data-test="default-edit-pages-btn"]').click();
        const editor = page.locator(".sre-root");
        await expect(editor).toBeVisible();
        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: pages editor`);

        // Opening a region inspector is the busiest the editor gets. On a phone
        // it is a bottom sheet; on the kiosk the rail is always present.
        await editor.locator(".sre-region").first().click();
        if (viewport.name === "phone") {
          await expect(editor.locator(".sre-rail.is-open")).toBeVisible();
          await expectAccessible(page, testInfo, `${viewport.name}/${theme}: region inspector`);
        }

        await page.getByRole("button", { name: "Close editor" }).click();
        await expect(editor).toBeHidden();

        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
