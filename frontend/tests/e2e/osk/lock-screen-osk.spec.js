/**
 * CLV-114: the on-screen keyboard on the Settings sign-in lock screen.
 *
 * Runs in the `osk-webkit` project (WebKit is the engine of cog, the default
 * kiosk browser, and of GNOME Web) and in `osk-chromium`, both with touch
 * enabled. Every key is tapped, never typed, so the keyboard is the only way a
 * character can reach the field.
 *
 * The backend is mocked by installApiMock: /api/auth/* is answered there and
 * host-acting routes are intercepted, so nothing reaches a real Calvin.
 */

import { expect, test } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";

const PASSWORD = "abc";
// Under this the field must sit, with this much room to spare.
const MARGIN = 8;

const CASES = [
  { name: "1280x800 landscape", viewport: { width: 1280, height: 800 } },
  { name: "800x1280 portrait", viewport: { width: 800, height: 1280 } },
  { name: "1024x600 7-inch panel", viewport: { width: 1024, height: 600 } },
  { name: "800x480 Pi display", viewport: { width: 800, height: 480 } },
  // The lock screen is zoomed by the Settings UI size (CLV-9 §6).
  { name: "1024x600 compact UI", viewport: { width: 1024, height: 600 }, uiSize: "compact" },
  {
    name: "1280x800 extra-large UI",
    viewport: { width: 1280, height: 800 },
    uiSize: "extra-large",
  },
];

for (const c of CASES) {
  test.describe(`lock screen keyboard · ${c.name}`, () => {
    test.use({ viewport: c.viewport, hasTouch: true });

    test("types a password through the on-screen keyboard and keeps the field above it", async ({
      page,
    }) => {
      let loginBody = null;
      const state = await installApiMock(page, {
        auth: { configured: true, authenticated: false },
        overrides: [
          [
            /^\/api\/auth\/login$/,
            async route => {
              loginBody = route.request().postDataJSON();
              // Wrong password: the lock screen stays, so nothing else loads.
              await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ detail: "Invalid password" }),
              });
            },
          ],
        ],
      });
      if (c.uiSize) {
        await page.addInitScript(size => {
          window.localStorage.setItem("calvin-ui-size", size);
        }, c.uiSize);
      }

      await page.goto("/settings");
      const field = page.locator("#auth-signin-password");
      await expect(field).toBeVisible();

      await field.tap();
      const osk = page.locator(".osk.osk--shown");
      await expect(osk).toBeVisible();
      await expect(field).toBeFocused();

      // The panel slides in (180ms) and the lock screen re-lays out; measure
      // once both have settled.
      const expectFieldAboveKeyboard = async () => {
        await expect
          .poll(async () => {
            const [fieldBox, oskBox] = await Promise.all([field.boundingBox(), osk.boundingBox()]);
            if (!fieldBox || !oskBox) return "not rendered";
            if (fieldBox.y < 0) return `field top ${fieldBox.y} is above the screen`;
            const gap = oskBox.y - (fieldBox.y + fieldBox.height);
            return gap >= MARGIN ? "above" : `field bottom is ${-gap}px past the keyboard top`;
          })
          .toBe("above");
      };
      await expectFieldAboveKeyboard();

      for (const key of PASSWORD) {
        await osk.locator(`.hg-button[data-skbtn="${key}"]`).tap();
      }

      // Focus never left the field, the DOM holds the value, and the field is
      // still clear of the keyboard.
      await expect(field).toBeFocused();
      await expect(field).toHaveValue(PASSWORD);
      await expect(field).toHaveAttribute("type", "password");
      await expect(osk).toBeVisible();
      await expectFieldAboveKeyboard();

      // Enter submits: the password Vue holds (v-model), not only the DOM
      // value, reaches the server.
      await osk.locator('.hg-button[data-skbtn="{enter}"]').tap();
      await expect.poll(() => loginBody).toEqual({ password: PASSWORD });
      await expect(page.getByText("That's not the admin password.")).toBeVisible();

      expect(state.hostActions).toEqual([]);
    });
  });
}
