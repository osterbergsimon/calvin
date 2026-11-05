/**
 * Clock bar editor (docs/design/2026-11-04-clock-bar-editor.md).
 *
 * The same spec runs on Chromium and WebKit (the cog kiosk engine). Every API
 * call is mocked, so no request ever reaches the owner's backend.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import {
  KIOSK,
  gotoSettings,
  expectSettingsReady,
  selectCategory,
} from "./phone/fixtures/navigation.js";

async function openEditor(page) {
  await gotoSettings(page, "Dashboard");
  await expectSettingsReady(page);
  await selectCategory(page, "Dashboard");
  await expect(page.locator("#section-clock-bar")).toBeVisible();
  await expect(page.locator("[data-test='clock-bar-mini']")).toBeVisible();
  await page.locator("[data-test='edit-clock-bar']").click();
  await expect(page.locator(".cbe-root")).toBeVisible();
  await expect(page.locator(".cbe-root .clock-bar-zone").first()).toBeVisible();
}

async function selectPart(page, partId) {
  await page.locator(`.cbe-root [data-part-id="${partId}"] .clock-bar-chip__hit`).first().click();
}

async function waitForDesign(page, api) {
  await expect.poll(() => api.configPosts.length).toBeGreaterThan(0);
  return api.configPosts[api.configPosts.length - 1].clockBarDesign;
}

test.describe("clock bar editor", () => {
  test("moves a part, hides another, saves, and reloads with the design", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { config: { clockShowDate: true } });
    await openEditor(page);

    // Move Time after Date with the rail's order control (no drag needed).
    await selectPart(page, "time");
    await page.locator("[data-test='move-later']").click();
    await expect
      .poll(() => api.configPosts[api.configPosts.length - 1]?.clockBarDesign)
      .toBeTruthy();

    // Hide Date by its Show switch, the same as dragging it to the shelf.
    await selectPart(page, "date");
    await page.getByRole("switch", { name: "Show Date" }).click();

    await expect
      .poll(() => api.configPosts[api.configPosts.length - 1]?.clockBarDesign?.horizontal?.hidden)
      .toContain("date");
    const design = api.configPosts[api.configPosts.length - 1].clockBarDesign;
    expect(Object.keys(api.configPosts[api.configPosts.length - 1])).toEqual(["clockBarDesign"]);
    expect(design.horizontal.zones.center).toEqual(["time"]);
    // Old keys stay untouched for the resolver's fallback.
    expect(api.config.clockShowDate).toBe(true);

    await page.locator("[data-test='done-clock-bar']").click();
    await expect(page.locator(".cbe-root")).toBeHidden();

    // A reload proves the one household key persisted.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await openEditor(page);
    await expect(page.locator(".cbe-root [data-shelf] [data-part-id='date']")).toBeVisible();
    // The dev-server font is not guaranteed to have metrics after a reload in
    // this headless harness, so assert the persisted structure rather than text
    // pixels here; the first pass above already proved the visible interaction.
    await expect(page.locator(".cbe-root [data-zone='center'] [data-part-id='time']")).toHaveCount(
      1
    );

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("keeps Status & menu reachable and out of the shelf", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await openEditor(page);

    await selectPart(page, "status");
    await expect(page.locator("[data-test='part-panel']")).toContainText(
      "Always shown, so Settings stays reachable."
    );
    await expect(page.getByRole("switch", { name: "Show Status & menu" })).toHaveCount(0);
    await expect(page.locator("[data-shelf]")).not.toContainText("Status & menu");

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test.describe("on a wall kiosk window", () => {
    test.use({ viewport: KIOSK });

    test("opens the same editor from Pages & regions", async ({ page, consoleErrors }) => {
      const api = await installApiMock(page);
      await gotoSettings(page, "Dashboard", { kiosk: "pi-panel" });
      await expectSettingsReady(page);
      await selectCategory(page, "Dashboard");

      await page.getByRole("button", { name: "Open editor" }).click();
      await expect(page.locator(".sre-root")).toBeVisible();
      await page.locator("[data-test='edit-clock-bar-look']").click();
      await expect(page.locator(".cbe-root")).toBeVisible();

      await selectPart(page, "logo");
      await page.getByRole("switch", { name: "Show Calvin logo" }).click();
      const design = await waitForDesign(page, api);
      expect(design.horizontal.hidden).toContain("logo");

      await page.keyboard.press("Escape");
      await expect(page.locator(".cbe-root")).toBeHidden();
      await expect(page.locator(".sre-root")).toBeVisible();

      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
});
