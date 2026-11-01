/**
 * calvin-q9m7: dismissing the on-screen keyboard on a touch screen.
 *
 * Runs in the `osk-webkit` project (WebKit is the engine of cog, the default
 * kiosk browser, and of GNOME Web) and in `osk-chromium`, both with touch
 * enabled. WebKit does not blur a focused input when a non-focusable element is
 * tapped, so "tap elsewhere" must hide the keyboard on its own.
 *
 * The backend is mocked by installApiMock: /api/auth/* is answered there and
 * host-acting routes are intercepted, so nothing reaches a real Calvin.
 */

import { expect, test } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

const openLockScreen = async page => {
  const state = await installApiMock(page, {
    auth: { configured: true, authenticated: false },
  });
  await page.goto("/settings");
  const field = page.locator("#auth-signin-password");
  await expect(field).toBeVisible();
  return { field, state };
};

const shownKeyboard = page => page.locator(".osk.osk--shown");

test("tapping outside the keyboard and the field hides it and blurs the field", async ({
  page,
}) => {
  const { field, state } = await openLockScreen(page);

  await field.tap();
  await expect(shownKeyboard(page)).toBeVisible();
  await expect(field).toBeFocused();

  // A non-focusable heading on the lock screen card.
  await page.locator(".auth-card__title").tap();

  await expect(shownKeyboard(page)).toHaveCount(0);
  await expect(field).not.toBeFocused();

  // A real control outside the field still receives its tap.
  await field.tap();
  await expect(shownKeyboard(page)).toBeVisible();
  await page.locator(".password-field__toggle").tap();
  await expect(field).toHaveAttribute("type", "text");
  await expect(shownKeyboard(page)).toHaveCount(0);

  expect(state.hostActions).toEqual([]);
});

test("the hide key hides the keyboard and keeps it hidden, until the field is tapped again", async ({
  page,
}) => {
  const { field, state } = await openLockScreen(page);

  await field.tap();
  await expect(shownKeyboard(page)).toBeVisible();

  await shownKeyboard(page).locator('.hg-button[data-skbtn="{hide}"]').tap();

  await expect(shownKeyboard(page)).toHaveCount(0);
  // The rest of the tap (touchend, then WebKit's compatibility mouse events)
  // must not reopen it, and neither must focus churn afterwards.
  await page.waitForTimeout(1000);
  await expect(shownKeyboard(page)).toHaveCount(0);

  // Tapping the field again is the way back.
  await field.tap();
  await expect(shownKeyboard(page)).toBeVisible();
  await expect(field).toBeFocused();

  expect(state.hostActions).toEqual([]);
});
