/**
 * CLV-66 — Dashboard and Screens settings on a phone.
 *
 * Dashboard: pages & regions launcher, clock bar, appearance, controls.
 * Screens: the Default page, one screen's own page, and per-screen overrides.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: Dashboard", () => {
  test("walks every Dashboard section", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Dashboard");

    const dashboard = page.locator(".dashboard-settings");
    await expect(dashboard.getByText("Pages & regions")).toBeVisible();
    await expect(dashboard.getByRole("button", { name: "Open editor" })).toBeVisible();
    for (const section of ["Clock", "Clock bar layout", "Appearance", "Controls"]) {
      await expect(
        dashboard.locator(".settings-section__eyebrow", { hasText: section }).first()
      ).toBeVisible();
    }
    await expectPhoneLayout(page, "Dashboard settings");

    // The theme chooser is the widest popover in the category.
    await dashboard.locator(".theme-picker__trigger").click();
    await expect(page.locator(".theme-picker__panel")).toBeVisible();
    await expectPhoneLayout(page, "theme chooser", { scope: ".theme-picker__panel" });
    await page.keyboard.press("Escape");

    // Hide controls is this screen's own choice (calvin-hi6w): it lands in
    // localStorage instead of the household config, so nothing is POSTed.
    const hideControls = dashboard.getByLabel("Hide controls");
    await hideControls.click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("calvin-screen-showUI")))
      .toBe("false");
    expect(api.requests).not.toContain("POST /api/config");
    await hideControls.click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("calvin-screen-showUI")))
      .toBe("true");

    await expectPhoneLayout(page, "Dashboard settings after saving");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("phone: Screens", () => {
  test("opens the Default page and a screen's own page", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");

    await expect(page.locator('[data-test="screens-category"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-card"]')).toHaveCount(2);
    await expectPhoneLayout(page, "Screens list");

    // Default is a screen too.
    await page.locator('[data-test="screen-default-card"]').click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
    await expect(page.locator('[data-test="default-page-row"]')).toHaveCount(2);
    await expectPhoneLayout(page, "Screens / Default");

    await page.locator('[data-test="default-edit-pages-btn"]').click();
    await expect(page.locator(".sre-root")).toBeVisible();
    await expectPhoneLayout(page, "pages editor opened from Default");
    await page.getByRole("button", { name: "Close editor" }).click();
    await expect(page.locator(".sre-root")).toBeHidden();

    await page.locator('[data-test="screens-back"]').click();
    await expect(page.locator('[data-test="screen-card"]').first()).toBeVisible();

    // One screen's own page: name, pages, display and power.
    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-name-input"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-page-row"]')).toHaveCount(2);
    await expect(page.getByText("Display", { exact: true })).toBeVisible();
    await expect(page.getByText("Power", { exact: true })).toBeVisible();
    await expectPhoneLayout(page, "Screens / one screen");

    const nameInput = page.locator('[data-test="screen-name-input"]');
    await nameInput.fill("Hallway wall");
    await nameInput.blur();
    await expect(page.getByText(/Saved\. This screen shows its new name/)).toBeVisible();
    await expect.poll(() => api.requests).toContain("PUT /api/kiosks/hallway/overrides");

    await expectPhoneLayout(page, "Screens / one screen after rename");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
