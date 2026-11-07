/**
 * calvin-gcle — the delete-page confirm must fit its three actions on a phone
 * and a desktop, even when the alternative ("Hide on <screen>") is long.
 *
 * Every route is mocked by fixtures/api-mock.js, host-acting ones included.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { gotoSettings, expectSettingsReady, selectCategory } from "./phone/fixtures/navigation.js";

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
