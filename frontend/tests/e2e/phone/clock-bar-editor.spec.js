/**
 * Clock bar editor on a phone (tap, no drag): the rail is the bottom sheet and
 * Zone / Order / Show are the only movement controls.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

async function openEditor(page) {
  await gotoSettings(page, "Dashboard");
  await expectSettingsReady(page);
  await selectCategory(page, "Dashboard");
  await page.locator("[data-test='edit-clock-bar']").click();
  await expect(page.locator(".cbe-root")).toBeVisible();
}

test.describe("phone: clock bar editor", () => {
  test("hides a part with the sheet, saves, and reloads with it on the shelf", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { config: { clockShowDate: true } });
    await openEditor(page);

    await expect(page.locator(".cbe-root.is-phone")).toBeVisible();
    await expect(page.locator(".cbe-rail")).toBeVisible();
    await expect(page.locator(".cbe-sheet-handle")).toBeVisible();
    await expectPhoneLayout(page, "clock bar editor", { scope: ".cbe-root" });

    // No drag on touch: tap Date, then use the rail's Show switch.
    await page.locator('.cbe-root [data-part-id="date"] .clock-bar-chip__hit').first().click();
    await expect(page.locator("[data-test='part-panel']")).toContainText("Date");
    await page.getByRole("switch", { name: "Show Date" }).click();

    await expect
      .poll(() => api.configPosts[api.configPosts.length - 1]?.clockBarDesign?.horizontal?.hidden)
      .toContain("date");
    const design = api.configPosts[api.configPosts.length - 1].clockBarDesign;
    expect(design.horizontal.zones.center).not.toContain("date");

    await page.locator("[data-test='done-clock-bar']").click();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await openEditor(page);
    await expect(page.locator(".cbe-root [data-shelf] [data-part-id='date']")).toBeVisible();
    await expectPhoneLayout(page, "clock bar editor after reload", { scope: ".cbe-root" });

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
