/**
 * CLV-66 — the phone is the setup device.
 *
 * First run (choose a password) and signing in, at 390x844, against a mocked
 * backend. Every host-acting route is intercepted by fixtures/api-mock.js.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import {
  PHONE,
  gotoSettings,
  expectSettingsReady,
  openSettingsFromDashboard,
} from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: first run and sign-in", () => {
  test("first run asks for an admin password, then opens Settings", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { auth: { configured: false, authenticated: false } });

    await gotoSettings(page);

    const card = page.locator('[data-test="auth-card"]');
    await expect(card).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose an admin password" })).toBeVisible();

    await page.locator("#auth-setup-password").fill("correct horse battery");
    await page.locator("#auth-setup-repeat").fill("correct horse battery");
    await expectPhoneLayout(page, "first-run password setup");
    await page.getByRole("button", { name: "Set password" }).click();

    await expectSettingsReady(page);
    expect(api.requests).toContain("POST /api/auth/setup");
    expect(consoleErrors).toEqual([]);
  });

  test("setup refuses a short password without leaving the page", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { auth: { configured: false, authenticated: false } });

    await gotoSettings(page);
    await page.locator("#auth-setup-password").fill("short");
    await page.locator("#auth-setup-repeat").fill("short");
    await page.getByRole("button", { name: "Set password" }).click();

    await expect(page.locator(".settings-layout")).toHaveCount(0);
    await expect(page.locator('[data-test="auth-card"]')).toBeVisible();
    expect(api.requests).not.toContain("POST /api/auth/setup");
    // The UI must say why, on the phone, without pushing the card sideways.
    await expect(page.locator(".password-field__error").first()).toBeVisible();
    await expectPhoneLayout(page, "first-run password error");
    expect(consoleErrors).toEqual([]);
  });

  test("a returning phone signs in and reaches every settings category", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { auth: { configured: true, authenticated: false } });

    await gotoSettings(page);
    await expect(page.getByRole("heading", { name: "Sign in to Settings" })).toBeVisible();
    await expectPhoneLayout(page, "sign-in screen");

    await page.locator("#auth-signin-password").fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expectSettingsReady(page);

    for (const category of ["Content", "Dashboard", "Screens", "Plugins", "System", "Security"]) {
      const item = page.locator(".category-rail__item", { hasText: category }).first();
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await expect(item).toHaveClass(/is-active/);
      await page.waitForLoadState("networkidle");
      await expectPhoneLayout(page, `${category} category`);
    }

    // Every API route the settings screen asked for had a sample answer.
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("Settings can be opened from the dashboard overflow menu on a phone", async ({
    page,
    consoleErrors,
  }) => {
    await installApiMock(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await openSettingsFromDashboard(page);
    await expectSettingsReady(page);
    await expectPhoneLayout(page, "settings opened from the dashboard");

    expect(consoleErrors).toEqual([]);
  });
});
