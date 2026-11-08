/**
 * E2E tests for light/dark theme switching.
 *
 * A theme mode lives in Settings › Screens › Default › Look as a "Light or dark"
 * pill (it stopped being a <select> when the Settings shell was redesigned), and
 * it is applied to <html> as the `.light` / `.dark` class. On a screen's own
 * page the same row writes that screen's overrides instead.
 *
 * Everything is answered by the mocked backend, so the suite runs without a
 * Calvin server and never reaches a real one.
 */

import { test, expect } from "@playwright/test";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { gotoDashboard, gotoSettings } from "./phone/fixtures/navigation.js";

const THEME_CONTROL = /^Light or dark:/;

/** Open Settings › Screens › Default and bring the Look section into view. */
async function openLook(page) {
  await gotoSettings(page, "Screens");
  await page.locator('[data-test="screen-default-card"]').click();
  await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
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

    await openLook(page);
    await chooseThemeMode(page, "Dark");

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
    await expect(html).not.toHaveClass(/light/);
  });

  test("should apply light theme class to HTML element", async ({ page }) => {
    await installApiMock(page, { config: { themeMode: "dark" } });

    await openLook(page);
    await chooseThemeMode(page, "Light");

    const html = page.locator("html");
    await expect(html).toHaveClass(/light/);
    await expect(html).not.toHaveClass(/dark/);
  });

  test("should persist theme selection", async ({ page }) => {
    const mock = await installApiMock(page, { config: { themeMode: "auto" } });

    await openLook(page);
    await chooseThemeMode(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The choice is auto-saved, not only kept in memory.
    expect(mock.requests).toContain("POST /api/config");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("shows every theme as a light and a dark thumbnail", async ({ page }) => {
    await installApiMock(page);

    await openLook(page);
    await page.locator(".theme-picker__trigger").click();
    const panel = page.locator(".theme-picker__panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".theme-preview-caption").first()).toHaveText("Light");
    await expect(panel.locator(".theme-preview-caption").nth(1)).toHaveText("Dark");
    await expect(
      panel.locator("[data-theme-id]").first().locator(".theme-preview-mini")
    ).toHaveCount(2);
  });
});

test.describe("Theme scope regressions (settings-scope §7 item 5)", () => {
  test("a kiosk loading its own dark config does not write the household theme", async ({
    page,
  }) => {
    const api = await installApiMock(page, {
      config: { themeMode: "dark", selectedTheme: null, typeTheme: null },
    });

    await page.goto("/?kiosk=hallway");
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // The kiosk shows its merged theme...
    await expect(page.locator("html")).toHaveClass(/dark/);
    // ...but loading it is not a change to the household.
    expect(api.configPosts).toEqual([]);
    expect(api.config.themeMode).toBe("dark");
  });

  test("applies a household theme change on the next config poll", async ({ page }) => {
    const api = await installApiMock(page, {
      config: { themeMode: "auto", configPollInterval: 1 },
    });

    await page.goto("/");
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/light/);

    api.config.themeMode = "dark";

    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 6000 });
    // A value that arrived from the server is applied, never echoed back.
    expect(api.configPosts).toEqual([]);
  });

  test("the household font comes from config", async ({ page }) => {
    const api = await installApiMock(page, { config: { typeTheme: "marquee" } });

    await gotoDashboard(page);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue("--font-display"))
      )
      .toContain("Space Grotesk");
    expect(api.configPosts).toEqual([]);
  });

  test("a screen page writes that screen's Look and never the household config", async ({
    page,
  }) => {
    const api = await installApiMock(page, { config: { themeMode: "auto" } });

    await gotoSettings(page, "Screens");
    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/light/);
    const control = page.getByRole("button", { name: THEME_CONTROL });
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await page.getByRole("option", { name: "Dark", exact: true }).click();
    await page.waitForLoadState("networkidle");

    await expect.poll(() => api.overridesByKiosk.hallway?.themeMode).toBe("dark");
    // Editing Hallway's look from this browser changes neither the household
    // nor this browser's own theme.
    expect(api.configPosts).toEqual([]);
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("#section-screen-look")).toContainText(
      "will switch on its next check (about 30 s)"
    );
  });
});
