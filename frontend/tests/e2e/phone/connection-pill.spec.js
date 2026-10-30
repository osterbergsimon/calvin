/**
 * CLV-66 — the connection pill on a phone (CLV-48).
 *
 * The dashboard hides the indicator while everything works, shows a pill after
 * two failed health checks (or immediately offline), and tapping it explains
 * why. This runs the pill, its popover and the recovery path at 390x844.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("phone: connection pill explains an unreachable server and recovers", async ({
  page,
  consoleErrors,
}) => {
  const api = await installApiMock(page);

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-test="connection-pill"]')).toHaveCount(0);

  // Every route fails, like a server that went away. Two failed health checks
  // are required before the UI worries; the online event asks for one each.
  api.down = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const pill = page.locator('[data-test="connection-pill"]').first();
  await expect(pill).toBeVisible({ timeout: 12000 });
  await expect(pill).toContainText("Can't reach Calvin");
  await expectPhoneLayout(page, "dashboard with the connection pill");

  await pill.click();
  const popover = page.locator('[data-test="connection-popover"]');
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("heading", { name: "Can't reach Calvin" })).toBeVisible();
  await expectPhoneLayout(page, "connection popover", { scope: '[data-test="connection-popover"]' });

  // Still down: the popover says so instead of pretending it worked.
  await page.locator('[data-test="connection-try-now"]').click();
  await expect(page.locator('[data-test="connection-try-failed"]')).toBeVisible();
  await expectPhoneLayout(page, "connection popover after a failed retry", {
    scope: '[data-test="connection-popover"]',
  });

  // Back online: one good check clears the pill.
  api.down = false;
  await page.locator('[data-test="connection-try-now"]').click();
  await expect(page.locator('[data-test="connection-connected"]')).toBeVisible();
  await expect(page.locator('[data-test="connection-pill"]')).toHaveCount(0);

  expect(api.unmatched).toEqual([]);
  // The browser logs each deliberately-failed health request; that is the
  // scenario under test, not an app error.
  expect(consoleErrors.filter(text => !/\/api\/health/.test(text))).toEqual([]);
});

test("phone: an offline phone says so without a server check", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
  });
  await installApiMock(page);

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const pill = page.locator('[data-test="connection-pill"]').first();
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("No network");
  await expectPhoneLayout(page, "offline dashboard");

  await pill.click();
  await expect(
    page.getByRole("heading", { name: "This screen is offline" })
  ).toBeVisible();
  await expectPhoneLayout(page, "offline popover", {
    scope: '[data-test="connection-popover"]',
  });

  expect(consoleErrors).toEqual([]);
});
