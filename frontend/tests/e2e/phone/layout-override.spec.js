/**
 * calvin-tnkg — a screen can force the desktop layout.
 *
 * At a phone's 390x844 the layout is the phone one. Choosing Desktop in
 * Settings › Screens › Default › Behaviour must switch to the desktop layout
 * and survive a reload; Auto must keep today's phone layout.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

/** Number of grid columns the Settings shell uses. Phone = 1, desktop = 2. */
const settingsColumns = page =>
  page
    .locator(".settings-layout")
    .evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);

/** Open Screens › Default, where the per-screen Layout row lives (§4). */
async function openDefaultScreen(page) {
  await selectCategory(page, "Screens");
  await page.locator("[data-test='screen-default-card']").click();
  await expect(page.locator("[data-test='default-screen-page']")).toBeVisible();
}

test("Auto keeps the phone layout and Desktop forces the desktop one", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page);
  await gotoSettings(page);
  await expectSettingsReady(page);

  const html = page.locator("html");
  await openDefaultScreen(page);
  const layout = page.getByRole("radiogroup", { name: "Layout" });

  // Auto is the default: today's phone layout, no layout class.
  await expect(html).not.toHaveClass(/calvin-layout-(desktop|phone)/);
  expect(await settingsColumns(page)).toBe(1);
  await expectPhoneLayout(page, "Default screen settings on Auto");

  // Forcing Desktop switches the shell to its desktop grid immediately.
  await layout.scrollIntoViewIfNeeded();
  await layout.getByRole("radio", { name: "Desktop" }).click();
  await expect(html).toHaveClass(/calvin-layout-desktop/);
  await expect.poll(() => settingsColumns(page)).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("calvin-layout-mode"))).toBe("desktop");

  // The choice is remembered for this browser.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/calvin-layout-desktop/);
  await expectSettingsReady(page);
  await openDefaultScreen(page);
  await expect.poll(() => settingsColumns(page)).toBe(2);

  // Back to Auto restores the phone layout.
  await page
    .getByRole("radiogroup", { name: "Layout" })
    .getByRole("radio", { name: "Auto" })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/calvin-layout-desktop/);
  await expect.poll(() => settingsColumns(page)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("calvin-layout-mode"))).toBe("auto");

  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
