/**
 * calvin-gcle — the delete-page confirm must fit its three actions on a phone
 * and a desktop, even when the alternative ("Hide on <screen>") is long.
 *
 * Every route is mocked by fixtures/api-mock.js, host-acting ones included.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import {
  expectSettingsReady,
  gotoSettings,
  openSection,
  selectCategory,
} from "./phone/fixtures/navigation.js";

const LONG_SCREEN = "Upstairs hallway portrait display beside the stairs";

const KIOSKS = [
  {
    id: "hallway",
    name: "Hallway",
    hostname: "hallway-pi",
    lastSeen: new Date().toISOString(),
    lastAppliedVersion: "1.6.0",
    agentVersion: "1.6.0",
    overrides: { displayName: LONG_SCREEN },
  },
  {
    id: "workshop",
    name: "Workshop",
    hostname: "workshop-pi",
    lastSeen: new Date().toISOString(),
    lastAppliedVersion: "1.6.0",
    agentVersion: "1.6.0",
    overrides: {},
  },
];

const json = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function openDeleteConfirm(page) {
  const api = await installApiMock(page, {
    overrides: [
      [
        /^\/api\/kiosks$/,
        (route, { method }) => (method === "GET" ? json(route, { kiosks: KIOSKS }) : false),
      ],
    ],
  });

  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Screens");

  await page.locator('[data-test="screen-card"]', { hasText: LONG_SCREEN }).click();
  await openSection(page, "screen-pages");
  await page.locator('[data-test="edit-pages-btn"]').click();

  const editor = page.locator(".sre-root");
  await expect(editor).toBeVisible();

  // On a phone the inspector is a bottom sheet; open it before using it.
  const showSettings = page.getByRole("button", { name: "Show settings" });
  if ((await showSettings.count()) > 0) await showSettings.click();

  // Preview on the long-named screen so the alternative names it.
  await page.getByRole("button", { name: /^Preview on screen:/ }).click();
  await page.getByRole("option", { name: LONG_SCREEN, exact: true }).click();

  await editor.locator(".ins-actions").getByRole("button", { name: "Delete page" }).click();

  const dialog = page.locator(".dialog:not(.dialog--full)");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-test="confirm-alternative"]')).toContainText(LONG_SCREEN);
  return { api, dialog };
}

async function actionGeometry(dialog) {
  return dialog.evaluate(el => {
    const box = el.getBoundingClientRect();
    return {
      dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      buttons: Array.from(el.querySelectorAll(".dialog__actions .btn")).map(button => {
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent.replace(/\s+/g, " ").trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          width: rect.width,
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth,
        };
      }),
    };
  });
}

const CASES = [
  { name: "phone", viewport: { width: 390, height: 844 }, stacked: true },
  { name: "desktop", viewport: { width: 1280, height: 720 }, stacked: false },
];

test.describe("delete-page confirm over the pages editor", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Escape closes the confirm and leaves the editor open", async ({ page, consoleErrors }) => {
    const { api, dialog } = await openDeleteConfirm(page);
    const editor = page.locator(".sre-root");
    await expect(editor).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(editor).toBeVisible();

    // A second Escape reaches the editor underneath.
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("admin sign-in over the dashboard", () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test("leaves the dashboard inert but the connection pill live", async ({
    page,
    consoleErrors,
  }) => {
    // Offline shows the pill without waiting for failed health checks.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    });

    const api = await installApiMock(page, {
      overrides: [
        [
          /^\/api\/config$/,
          (route, { method }) =>
            method === "POST"
              ? route.fulfill({
                  status: 401,
                  contentType: "application/json",
                  body: JSON.stringify({
                    detail: { code: "admin_required", message: "Admin required." },
                  }),
                })
              : false,
        ],
      ],
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".clock-bar-horizontal")).toBeVisible();

    const pill = page.locator('[data-test="connection-pill"]').first();
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("No network");

    // An admin write answers 401, opening the in-place sign-in dialog.
    await page.getByRole("button", { name: "More controls" }).click();
    await page.getByRole("menuitem", { name: /Lock layout|Unlock layout/ }).click();
    const dialog = page.getByRole("dialog", { name: "Sign in to continue" });
    await expect(dialog).toBeVisible();

    // The page behind is inert; the pill nested in the clock bar is not.
    expect(
      await page.locator(".dashboard-stage").evaluate(el => Boolean(el.closest("[inert]")))
    ).toBe(true);
    expect(await pill.evaluate(el => Boolean(el.closest("[inert]")))).toBe(false);
    expect(await dialog.evaluate(el => Boolean(el.closest("[inert]")))).toBe(false);

    // It stays in the accessibility tree and keeps its state over the dialog.
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("No network");
    await expect(dialog).toBeVisible();

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    // The deliberately refused admin write is the scenario, not an app error.
    expect(
      consoleErrors.filter(text => !/401|Unauthorized|Failed to update config/.test(text))
    ).toEqual([]);
  });
});

test.describe("toasts over the pages editor", () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test("a toast stays live and can be dismissed", async ({ page, consoleErrors }) => {
    const { api, dialog } = await openDeleteConfirm(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator(".sre-root")).toBeVisible();

    await page.evaluate(async () => {
      const { useNotificationsStore } = await import("/src/stores/notifications.js");
      useNotificationsStore().notify({
        severity: "error",
        eyebrow: "Save",
        message: "Could not save the page.",
        persistent: true,
      });
    });

    const toast = page.locator(".status-rail .annunciator");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Could not save the page.");
    await toast.locator(".annunciator__close").click();
    await expect(toast).toBeHidden();

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

for (const c of CASES) {
  test.describe(`delete-page confirm at ${c.name}`, () => {
    test.use({ viewport: c.viewport });

    test(`three actions stay inside the dialog with a long screen name`, async ({
      page,
      consoleErrors,
    }) => {
      const { api, dialog } = await openDeleteConfirm(page);
      const { dialog: box, buttons } = await actionGeometry(dialog);

      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        expect(button.height, `${button.text} touch target`).toBeGreaterThanOrEqual(44);
        expect(button.left, `${button.text} left edge`).toBeGreaterThanOrEqual(box.left - 1);
        expect(button.right, `${button.text} right edge`).toBeLessThanOrEqual(box.right + 1);
        expect(button.top, `${button.text} top edge`).toBeGreaterThanOrEqual(box.top - 1);
        expect(button.bottom, `${button.text} bottom edge`).toBeLessThanOrEqual(box.bottom + 1);
        expect(button.scrollWidth, `${button.text} clips its text`).toBeLessThanOrEqual(
          button.clientWidth + 1
        );
      }

      if (c.stacked) {
        const rows = new Set(buttons.map(button => Math.round(button.top)));
        expect(rows.size, "stacked actions share no row").toBe(buttons.length);
      }

      expect(api.hostActions).toEqual([]);
      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
