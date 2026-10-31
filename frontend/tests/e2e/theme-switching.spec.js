/**
 * E2E tests for light/dark theme switching.
 *
 * A theme mode lives in Settings › Dashboard › Appearance as a "Light or dark"
 * pill (it stopped being a <select> when the Settings shell was redesigned), and
 * it is applied to <html> as the `.light` / `.dark` class.
 *
 * Everything is answered by the mocked backend, so the suite runs without a
 * Calvin server and never reaches a real one.
 */

import { test, expect } from "@playwright/test";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { gotoSettings } from "./phone/fixtures/navigation.js";

const THEME_CONTROL = /^Light or dark:/;

/** Open Settings › Dashboard and bring the Appearance section into view. */
async function openAppearance(page) {
  await gotoSettings(page, "Dashboard");
  const control = page.getByRole("button", { name: THEME_CONTROL });
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
}

/** Pick one of the Light / Dark / Follow device / On a schedule options. */
async function chooseThemeMode(page, label) {
  await page.getByRole("button", { name: THEME_CONTROL }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Theme Switching", () => {
  test("should apply dark theme class to HTML element", async ({ page }) => {
    await installApiMock(page, { config: { themeMode: "auto" } });

    await openAppearance(page);
    await chooseThemeMode(page, "Dark");

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
    await expect(html).not.toHaveClass(/light/);
  });

  test("should apply light theme class to HTML element", async ({ page }) => {
    await installApiMock(page, { config: { themeMode: "dark" } });

    await openAppearance(page);
    await chooseThemeMode(page, "Light");

    const html = page.locator("html");
    await expect(html).toHaveClass(/light/);
    await expect(html).not.toHaveClass(/dark/);
  });

  test("should persist theme selection", async ({ page }) => {
    const mock = await installApiMock(page, { config: { themeMode: "auto" } });

    await openAppearance(page);
    await chooseThemeMode(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The choice is auto-saved, not only kept in memory.
    expect(mock.requests).toContain("POST /api/config");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
