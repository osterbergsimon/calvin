/**
 * CLV-66 — Dashboard and Screens settings on a phone.
 *
 * Dashboard: pages & regions launcher, clock bar and remote buttons.
 * Screens: the Default page, one screen's own page, and per-screen overrides
 * (including the Look group that used to be Dashboard › Appearance).
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: Dashboard", () => {
  test("walks every Dashboard section", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Dashboard");

    const dashboard = page.locator(".dashboard-settings");
    await expect(dashboard.getByText("Pages & regions")).toBeVisible();
    await expect(dashboard.getByRole("button", { name: "Open editor" })).toBeVisible();
    for (const section of ["Clock bar", "Remote buttons"]) {
      await expect(
        dashboard.locator(".settings-section__eyebrow", { hasText: section }).first()
      ).toBeVisible();
    }
    // The three old clock sections are one section with the real bar preview.
    await expect(dashboard.locator("[data-test='clock-bar-mini']")).toBeVisible();
    await expect(dashboard.getByRole("button", { name: "Edit clock bar" })).toBeVisible();
    await expect(dashboard.locator("#section-clock-bar-layout")).toHaveCount(0);
    await expect(dashboard.locator("#section-clock-bar-items")).toHaveCount(0);
    // Appearance moved to Screens › Look, so Dashboard has no theme row.
    await expect(dashboard.locator("#section-appearance")).toHaveCount(0);
    await expect(dashboard.locator(".theme-picker__trigger")).toHaveCount(0);
    await expectPhoneLayout(page, "Dashboard settings");

    // The moved per-screen groups leave a signpost behind (§4). It opens
    // Screens › Default on a plain browser, where the household values live.
    const signpost = dashboard.locator('[data-test="dashboard-screen-signpost"]');
    await expect(signpost).toContainText("Look, focus light and controls are set per screen.");
    await dashboard.getByRole("button", { name: "Open Screens" }).click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
    const controls = page.locator("#section-screen-controls");
    await expect(controls).toBeVisible();
    await expect(page.locator("#section-screen-effects")).toBeVisible();
    await expect(page.locator("#section-screen-look")).toBeVisible();

    // The theme chooser is the widest popover in Screens now.
    await page.locator(".theme-picker__trigger").click();
    await expect(page.locator(".theme-picker__panel")).toBeVisible();
    await expect(page.locator(".theme-preview-caption").first()).toHaveText("Light");
    await expect(page.locator(".theme-preview-caption").nth(1)).toHaveText("Dark");
    await expectPhoneLayout(page, "theme chooser", { scope: ".theme-picker__panel" });
    await page.keyboard.press("Escape");

    // On Default the Controls rows write the household config.
    await controls.getByLabel("Hide controls").click();
    await expect.poll(() => api.config.showUI).toBe(false);
    await expect.poll(() => api.requests).toContain("POST /api/config");

    await expectPhoneLayout(page, "Screens / Default after saving");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("phone: Screens", () => {
  test("opens the Default page and a screen's own page", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");

    await expect(page.locator('[data-test="screens-category"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-card"]')).toHaveCount(2);
    await expectPhoneLayout(page, "Screens list");

    // Default is a screen too.
    await page.locator('[data-test="screen-default-card"]').click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
    await expect(page.locator('[data-test="default-page-row"]')).toHaveCount(2);
    await expectPhoneLayout(page, "Screens / Default");

    await page.locator('[data-test="default-edit-pages-btn"]').click();
    await expect(page.locator(".sre-root")).toBeVisible();
    await expectPhoneLayout(page, "pages editor opened from Default");
    await page.getByRole("button", { name: "Close editor" }).click();
    await expect(page.locator(".sre-root")).toBeHidden();

    await page.locator('[data-test="screens-back"]').click();
    await expect(page.locator('[data-test="screen-card"]').first()).toBeVisible();

    // One screen's own page: name, pages, display and power.
    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-name-input"]')).toBeVisible();
    await expect(page.locator('[data-test="screen-page-row"]')).toHaveCount(2);
    await expect(page.locator("#section-screen-look")).toBeVisible();
    await expect(page.getByText("Theme", { exact: true })).toBeVisible();
    await expect(page.getByText("Font", { exact: true })).toBeVisible();
    await expect(page.getByText("Display", { exact: true })).toBeVisible();
    await expect(page.getByText("Dashboard size", { exact: true })).toBeVisible();
    await expect(page.getByText("Settings text size", { exact: true })).toBeVisible();
    await expect(page.getByText("Effects & focus", { exact: true })).toBeVisible();
    await expect(page.getByText("Controls", { exact: true })).toBeVisible();
    await expect(page.getByText("Power", { exact: true })).toBeVisible();
    await expectPhoneLayout(page, "Screens / one screen");

    const nameInput = page.locator('[data-test="screen-name-input"]');
    await nameInput.fill("Hallway wall");
    await nameInput.blur();
    await expect(page.getByText(/Saved\. This screen updates within 30 seconds/)).toBeVisible();
    await expect.poll(() => api.requests).toContain("PUT /api/kiosks/hallway/overrides");

    await expectPhoneLayout(page, "Screens / one screen after rename");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("turns a screen on and off now without calling a host route", async ({
    page,
    consoleErrors,
  }) => {
    const week = [0, 1, 2, 3, 4, 5, 6].map(day => ({
      day,
      enabled: true,
      onTime: "06:00",
      offTime: "22:00",
    }));
    const api = await installApiMock(page, {
      config: {
        timezone: "Europe/Stockholm",
        displayScheduleEnabled: true,
        displaySchedule: week,
      },
    });
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");
    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();

    // Either choice can be the one that is available, depending on the wall
    // clock the CI runs at. Pick the enabled one so the test is time-agnostic.
    const offButton = page.locator('[data-test="screen-now-off"]');
    const onButton = page.locator('[data-test="screen-now-on"]');
    const turningOff = await offButton.isEnabled();
    await (turningOff ? offButton : onButton).click();
    const power = turningOff ? "off" : "on";
    const state = turningOff ? "Off now" : "On now";
    await expect.poll(() => api.overridesByKiosk.hallway?.screenNow?.power).toBe(power);
    // The choice carries the UTC instant; the agent computes the boundary.
    expect(api.overridesByKiosk.hallway.screenNow.setAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(api.overridesByKiosk.hallway.screenNow.setAt))).toBe(false);
    await expect(page.locator('[data-test="screen-now-state"]')).toHaveText(state);
    await expect(page.locator('[data-test="screen-now-until"]')).toHaveText(
      /^(On|Off) until \d{2}:\d{2}$/
    );

    await page.getByRole("button", { name: "Follow schedule" }).click();
    await expect.poll(() => api.overridesByKiosk.hallway?.screenNow).toBeUndefined();

    // The manual choice is a kiosk override, never a host-acting route.
    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
