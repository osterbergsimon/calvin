/**
 * CLV-66 — Plugins, System and Security on a phone.
 *
 * These categories carry the host-acting buttons (update, restart, display
 * power). Every one is answered by the mock's dedicated host-action routes, so
 * the test proves the interception path instead of touching a real machine.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: Plugins", () => {
  test("lists every plugin kind and opens a card's settings", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Plugins");

    const category = page.locator(".plugins-category");
    await expect(category.locator(".list-row__name", { hasText: "ICS calendar" })).toBeVisible();
    await expect(category.locator(".list-row__name", { hasText: "Web page" })).toBeVisible();
    await expectPhoneLayout(page, "Plugins category");

    // Kind filters are a segmented control; each one narrows the list.
    const filters = category.locator(".seg").first();
    for (const kind of ["Calendar", "Photos", "Web page & app", "Theme", "All"]) {
      await filters.getByRole("radio", { name: kind, exact: true }).click();
      await expect(filters.getByRole("radio", { name: kind, exact: true })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      if (kind === "Theme") {
        // CLV-80 review: a theme that fails its load check is kept but says it
        // needs an update, not that it can be chosen in Appearance.
        const theme = category.locator(".pc-card", { hasText: "Midnight" }).first();
        await expect(theme.locator(".pc-summary")).toHaveText(
          "Needs an update to work with this Calvin."
        );
        await expect(theme.locator(".pc-summary")).not.toContainText("Choose it in");
      }
      await expectPhoneLayout(page, `Plugins filtered to ${kind}`);
    }

    const card = category.locator(".pc-card", { hasText: "ICS calendar" }).first();
    await card.getByRole("button", { name: /Settings/ }).click();
    await expect(card.locator(".pc-section-title")).toHaveText("Settings");
    await expectPhoneLayout(page, "expanded plugin card");

    // Install section is reachable and renders its repository form.
    await expect(category.getByText("Install from the Calvin catalog")).toBeVisible();
    await expectPhoneLayout(page, "Plugins install section");

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("phone: System", () => {
  test("walks updates, versions, restart, and advanced settings", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "System");

    const system = page.locator(".maintenance-settings");
    await expect(
      system.locator(".settings-section__eyebrow", { hasText: "Updates" }).first()
    ).toBeVisible();
    await expect(
      system.locator(".settings-section__eyebrow", { hasText: "Versions & status" }).first()
    ).toBeVisible();
    await expect(page.locator('[data-test="version-readout"]')).toContainText("1.6.0");
    await expectPhoneLayout(page, "System category");

    // The Advanced disclosure holds the installer-facing rows.
    await system.getByText("Advanced", { exact: true }).click();
    await expect(system.getByText("Check for setting changes every")).toBeVisible();
    await expectPhoneLayout(page, "System advanced section");

    // Host actions are intercepted by fixtures/api-mock.js, never executed.
    // Do this last: a real restart replaces the page with a waiting overlay.
    await page.locator('[data-test="restart-backend"]').click();
    const confirm = page.locator(".confirm-modal");
    await expect(confirm).toBeVisible();
    await expectPhoneLayout(page, "restart confirmation", { scope: ".confirm-modal" });
    await confirm.getByRole("button", { name: "Restart" }).click();
    await expect.poll(() => api.hostActions).toContain("POST /api/system/restart-backend");
    await expect(page.getByText(/Calvin is restarting/)).toBeVisible();

    expect(api.hostActions.every(call => call.startsWith("POST /api/system/"))).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("phone: Security", () => {
  test("manages API keys, admin access and allowed sites", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Security");

    const security = page.locator(".security-settings");
    await expect(
      security.locator(".settings-section__eyebrow", { hasText: "Admin access" })
    ).toBeVisible();
    await expect(
      security.locator(".settings-section__eyebrow", { hasText: "API keys" })
    ).toBeVisible();
    await expect(
      security.locator('[data-test="api-key-row"]', { hasText: "Home Assistant" })
    ).toBeVisible();
    await expectPhoneLayout(page, "Security category");

    // Create a key: name, scope, then the one-time secret.
    await page.locator('[data-test="api-keys-create"]').click();
    const form = page.locator('[data-test="api-key-form"]');
    await expect(form).toBeVisible();
    await page.locator('[data-test="api-key-name"]').fill("Kitchen display");
    await page.locator('[data-test="scope-admin"]').check();
    await expectPhoneLayout(page, "create API key form", { scope: '[data-test="api-key-form"]' });
    await page.locator('[data-test="api-key-submit"]').click();

    await expect(page.locator('[data-test="api-key-result"]')).toBeVisible();
    await expect(page.locator('[data-test="api-key-secret"]')).toHaveValue(
      "calvin_new1_secret_value"
    );
    await expectPhoneLayout(page, "new API key secret");
    await page.locator('[data-test="api-key-done"]').click();
    await expect.poll(() => api.requests).toContain("POST /api/auth/keys");

    // Change the admin password.
    await page.locator('[data-test="admin-change-password"]').click();
    const changeForm = page.locator('[data-test="admin-change-form"]');
    await expect(changeForm).toBeVisible();
    const passwordInputs = changeForm.locator('input[type="password"]');
    await passwordInputs.nth(0).fill("correct horse battery");
    await passwordInputs.nth(1).fill("new correct horse battery");
    await expectPhoneLayout(page, "change password form", {
      scope: '[data-test="admin-change-form"]',
    });
    await page.locator('[data-test="admin-change-submit"]').click();
    await expect(changeForm).toBeHidden();
    await expect.poll(() => api.requests).toContain("POST /api/auth/password");

    // Allowed sites keeps the add row usable on a phone.
    await page.locator('[data-test="origin-input"]').fill("https://photos.local");
    await page.locator('[data-test="origin-add"]').click();
    await page.locator('[data-test="origins-save"]').click();
    await expect.poll(() => api.requests).toContain("PUT /api/security/allowed-origins");

    await expectPhoneLayout(page, "Security after changes");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
