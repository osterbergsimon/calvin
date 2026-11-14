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
  selectCategory,
} from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: first run and sign-in", () => {
  test("first run asks for an admin password, then opens Settings", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { auth: { configured: false, authenticated: false } });

    // A phone arrives from the server screen's QR: ?setup= carries the code
    // and must not stay in the address bar.
    await page.goto("/settings?setup=ABCD-EFGH");
    await expect(page.locator(".settings-page")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const card = page.locator('[data-test="auth-card"]');
    await expect(card).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose an admin password" })).toBeVisible();
    await expect(page.locator("#auth-setup-code")).toHaveValue("ABCD-EFGH");
    expect(new URL(page.url()).searchParams.has("setup")).toBe(false);

    await page.locator("#auth-setup-password").fill("correct horse battery");
    await page.locator("#auth-setup-repeat").fill("correct horse battery");
    await expectPhoneLayout(page, "first-run password setup");
    await page.getByRole("button", { name: "Set password" }).click();

    await expectSettingsReady(page);
    expect(api.requests).toContain("POST /api/auth/setup");
    expect(api.setupBody).toEqual({ password: "correct horse battery", code: "ABCD-EFGH" });
    expect(consoleErrors).toEqual([]);
  });

  test("setup refuses a short password without leaving the page", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { auth: { configured: false, authenticated: false } });

    await page.goto("/settings?setup=ABCD-EFGH");
    await expect(page.locator(".settings-page")).toBeVisible();
    await page.waitForLoadState("networkidle");
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

    // A phone gets the categories as a list of pages, not the desktop rail.
    await expect(page.locator(".category-rail")).toHaveCount(0);
    await expectPhoneLayout(page, "category list");
    for (const category of ["Content", "Dashboard", "Screens", "Plugins", "System", "Security"]) {
      await selectCategory(page, category);
      await expect(page.locator('[data-test="settings-phone-home"]')).toHaveCount(0);
      await expectPhoneLayout(page, `${category} category`);
      // The phone's own back gesture returns to the list.
      await page.goBack();
      await expect(page.locator('[data-test="settings-phone-home"]')).toBeVisible();
    }

    // Every API route the settings screen asked for had a sample answer.
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a phone opens Settings from its own button, in the ⋯ menu's place", async ({
    page,
    consoleErrors,
  }) => {
    await installApiMock(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The menu's other items are wall-display tools; the phone gets the gear.
    await expect(page.getByRole("button", { name: "More controls" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await openSettingsFromDashboard(page);
    await expectSettingsReady(page);
    await expect(page.locator('[data-test="settings-phone-home"]')).toBeVisible();
    await expectPhoneLayout(page, "settings opened from the dashboard");

    expect(consoleErrors).toEqual([]);
  });

  test("a phone keeps a way into Settings when the screen hides its controls", async ({
    page,
    consoleErrors,
  }) => {
    await installApiMock(page, { config: { showUI: false, clockBarShowInKiosk: false } });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // No clock bar on screen: the button floats in a bottom corner.
    const button = page.locator('[data-test="phone-settings-button"]');
    await expect(button).toBeVisible();
    await expect(button).toHaveText("Settings");
    // Scoped: the hot-corner hint beside it ignores taps on purpose.
    await expectPhoneLayout(page, "dashboard with controls hidden", {
      scope: '[data-test="phone-settings-button"]',
    });
    await button.click();
    await expectSettingsReady(page);

    expect(consoleErrors).toEqual([]);
  });

  test("a screen's page is a list of sections, each its own page", async ({
    page,
    consoleErrors,
  }) => {
    await installApiMock(page);
    await gotoSettings(page, "Screens");
    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="section-index-screen-look"]')).toBeVisible();
    await expect(page.locator("#section-screen-look")).toHaveCount(0);
    await expectPhoneLayout(page, "a screen's section list");

    await page.locator('[data-test="section-index-screen-look"]').click();
    await expect(page.locator("#section-screen-look")).toBeVisible();
    await expect(page.locator("#section-screen-display")).toHaveCount(0);
    await expect(page.locator(".settings-topbar__location")).toHaveText("Look");
    expect(new URL(page.url()).searchParams.get("section")).toBe("screen-look");
    await expectPhoneLayout(page, "one section of a screen");

    // Back in the top bar steps up one page at a time.
    await page.locator('.settings-topbar [data-action="back"]').click();
    await expect(page.locator('[data-test="section-index-screen-look"]')).toBeVisible();
    await page.locator('.settings-topbar [data-action="back"]').click();
    await expect(page.locator('[data-test="screen-card"]').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("a link to a removed screen says so, inset inside the list's panel", async ({
    page,
    consoleErrors,
  }) => {
    await installApiMock(page);
    await page.goto("/settings?category=screens&screen=ghost");
    const note = page.locator('[data-test="screen-removed-note"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText("That screen was removed");
    expect(new URL(page.url()).searchParams.has("screen")).toBe(false);
    // Not on the card's top border: clear of the panel's edge on every side.
    const gaps = await page.evaluate(() => {
      const n = document.querySelector('[data-test="screen-removed-note"]').getBoundingClientRect();
      const p = document.querySelector(".settings-section__panel").getBoundingClientRect();
      return { top: n.top - p.top, left: n.left - p.left };
    });
    expect(gaps.top).toBeGreaterThanOrEqual(8);
    expect(gaps.left).toBeGreaterThanOrEqual(8);
    await expectPhoneLayout(page, "removed screen note");
    expect(consoleErrors).toEqual([]);
  });
});
