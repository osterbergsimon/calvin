/**
 * Lock-screen accessibility audit (CLV-65).
 *
 * The two screens someone meets before they can change anything: choosing the
 * admin password on first run, and signing in on a device that already has one.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { gotoSettings } from "../phone/fixtures/navigation.js";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { expectTheme, THEMES, VIEWPORTS } from "./fixtures/viewports.js";

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: lock screen`, () => {
      test.use({ viewport: viewport.size, colorScheme: theme });

      test("first-run password screen is accessible", async ({ page, consoleErrors }, testInfo) => {
        await installApiMock(page, { auth: { configured: false, authenticated: false } });
        await gotoSettings(page);
        await expect(page.locator('[data-test="auth-card"]')).toBeVisible();
        await expect(page.getByRole("heading", { name: "Choose an admin password" })).toBeVisible();
        await expectTheme(page, theme);

        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: first-run password`);
        expect(consoleErrors).toEqual([]);
      });

      test("sign-in screen is accessible", async ({ page, consoleErrors }, testInfo) => {
        await installApiMock(page, { auth: { configured: true, authenticated: false } });
        await gotoSettings(page);
        await expect(page.locator('[data-test="auth-card"]')).toBeVisible();
        await expect(page.getByRole("heading", { name: "Sign in to Settings" })).toBeVisible();
        await expectTheme(page, theme);

        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: sign-in`);
        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
