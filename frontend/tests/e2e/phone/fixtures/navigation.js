/**
 * Shared navigation for the phone/kiosk suite.
 */

import { expect } from "@playwright/test";

export const PHONE = { width: 390, height: 844 };
export const KIOSK = { width: 800, height: 480 };
/**
 * A wall kiosk opens Calvin with its identity (?kiosk=<id>). Without it an
 * 800x480 window is a short landscape screen, i.e. a phone turned sideways.
 */
export const KIOSK_ID = "pi-panel";

/** Open the dashboard with mocked data already in place. */
export async function gotoDashboard(page) {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** Open Settings directly (the address a phone opens from the QR card). */
export async function gotoSettings(page, category, { kiosk = null } = {}) {
  await page.goto(kiosk ? `/settings?kiosk=${encodeURIComponent(kiosk)}` : "/settings");
  await expect(page.locator(".settings-page")).toBeVisible();
  await page.waitForLoadState("networkidle");
  if (category) await selectCategory(page, category);
}

/** Wait for the unlocked settings shell to be interactive. */
export async function expectSettingsReady(page) {
  await expect(page.locator(".settings-topbar")).toBeVisible();
  await expect(page.locator(".settings-layout")).toBeVisible();
  await expect(page.locator(".category-rail")).toBeVisible();
}

/** Click a settings category in the rail and wait for its content. */
export async function selectCategory(page, label) {
  const item = page.locator(".category-rail__item", { hasText: label }).first();
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(item).toHaveClass(/is-active/);
  await page.waitForLoadState("networkidle");
}

/** Reach Settings the way a person does: ⋯ › Settings. */
export async function openSettingsFromDashboard(page) {
  const more = page.getByRole("button", { name: "More controls" });
  await expect(more).toBeVisible();
  await more.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.locator(".settings-page")).toBeVisible();
}
