/**
 * calvin-3xz9 — the photo frame on a touch kiosk.
 *
 * A screen with the frame on goes fullscreen photos after its idle wait; the
 * tap that wakes it only wakes it and leaves the dashboard underneath alone.
 * Every request is answered by the mock (host-acting routes included).
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { KIOSK, KIOSK_ID } from "./fixtures/navigation.js";

test.use({ viewport: KIOSK, hasTouch: true, isMobile: false });

test("kiosk: the photo frame enters after idle and the first tap only wakes it", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page, {
    overrides: [
      [
        /^\/api\/kiosks\/[^/]+\/config$/,
        (route, { state }) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...state.config,
              photoFrameEnabled: true,
              photoFrameTimeout: 1,
              photoFrameSourceIds: [],
            }),
          }),
      ],
    ],
  });

  // A kiosk identity makes the per-screen (override) value apply.
  await page.goto(`/?kiosk=${encodeURIComponent(KIOSK_ID)}`);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/calvin-kiosk/);

  // After the idle wait the fullscreen photo frame appears.
  const frame = page.locator(".photo-slideshow.fullscreen");
  await expect(frame).toBeVisible({ timeout: 15_000 });

  // Watch the element under the tap and the document: the wake tap must not
  // deliver a click to either (a leaked click could press a dashboard control).
  const tapX = KIOSK.width / 2;
  const tapY = KIOSK.height / 2;
  await page.evaluate(
    ({ x, y }) => {
      window.__wakeClicks = 0;
      const underTap = document.elementFromPoint(x, y);
      underTap?.addEventListener("click", () => {
        window.__wakeClicks += 1;
      });
      document.addEventListener(
        "click",
        () => {
          window.__wakeClicks += 1;
        },
        true
      );
    },
    { x: tapX, y: tapY }
  );

  // The first tap wakes the screen and is swallowed; the dashboard returns.
  await page.touchscreen.tap(tapX, tapY);
  await expect(frame).toBeHidden();
  await expect(page.locator(".dashboard-view")).toBeVisible();
  await expect(page.locator(".settings-page")).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__wakeClicks)).toBe(0);

  // Nothing host-acting was ever allowed through the mock.
  expect(api.hostActions).toEqual([]);
  expect(api.unmatched).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
