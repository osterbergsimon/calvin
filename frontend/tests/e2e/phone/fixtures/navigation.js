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

// Settings on a phone is a stack of pages (useSettingsPhoneNav.js): the
// category list, a category, and for long categories one section at a time.
// A kiosk or desktop keeps the rail.
const CATEGORY_IDS = {
  Content: "content",
  Dashboard: "dashboard",
  Screens: "screens",
  Plugins: "plugins",
  System: "maintenance",
  Security: "security",
};

const phoneHome = page => page.locator('[data-test="settings-phone-home"]');

/** Wait for the unlocked settings shell to be interactive. */
export async function expectSettingsReady(page) {
  await expect(page.locator(".settings-topbar")).toBeVisible();
  await expect(
    page.locator('.category-rail, [data-test="settings-phone-home"], .settings-layout').first()
  ).toBeVisible();
}

/** Back to the phone's category list from any page below it. */
export async function gotoPhoneHome(page) {
  const back = page.locator('.settings-topbar [data-action="back"]');
  for (let i = 0; i < 4 && (await back.isVisible()); i += 1) {
    await back.click();
    await page.waitForLoadState("networkidle");
  }
  await expect(phoneHome(page)).toBeVisible();
}

/** Open a settings category: a rail item, or a page of the phone's list. */
export async function selectCategory(page, label) {
  const rail = page.locator(".category-rail");
  if (await rail.isVisible()) {
    const item = page.locator(".category-rail__item", { hasText: label }).first();
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await expect(item).toHaveClass(/is-active/);
    await page.waitForLoadState("networkidle");
    return;
  }
  if (!(await phoneHome(page).isVisible())) await gotoPhoneHome(page);
  const id = CATEGORY_IDS[label] ?? label.toLowerCase();
  await page.locator(`[data-test="settings-phone-category-${id}"]`).click();
  await expect(page.locator(".settings-topbar__location")).toHaveText(label);
  await page.waitForLoadState("networkidle");
}

/**
 * On a phone, open one section of a long page (Content, System, a screen):
 * its row in the page's section list. No-op where the page shows every
 * section (a kiosk, a desktop, a short category).
 */
export async function openSection(page, sectionId) {
  const row = page.locator(`[data-test="section-index-${sectionId}"]`);
  if (!(await row.isVisible())) return;
  await row.click();
  await expect(page.locator(`#section-${sectionId}`)).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** On a phone, step back from a section to its page's section list. */
export async function closeSection(page) {
  const url = new URL(page.url());
  if (!url.searchParams.has("section")) return;
  await page.locator('.settings-topbar [data-action="back"]').click();
  await page.waitForLoadState("networkidle");
}

/**
 * Every section a phone page lists (`section-index-*` rows), in order. Empty
 * where the page shows all its sections (a desktop, a short category).
 */
export async function listSections(page) {
  return page
    .locator('[data-test^="section-index-"]:not([data-test="section-index-select"])')
    .evaluateAll(rows => rows.map(row => row.dataset.test.replace("section-index-", "")));
}

/**
 * From a screen's page (or one of its sections) back to the Screens list:
 * the phone's top-bar back, or the pane's "‹ Screens" button elsewhere.
 */
export async function backToScreens(page) {
  await closeSection(page);
  const back = page.locator('.settings-topbar [data-action="back"]');
  if (await back.isVisible()) await back.click();
  else await page.locator('[data-test="screens-back"]').click();
  await page.waitForLoadState("networkidle");
}

/**
 * Reach Settings the way a person does: the Settings button on a phone,
 * ⋯ › Settings elsewhere.
 */
export async function openSettingsFromDashboard(page) {
  const phoneButton = page.locator('[data-test="phone-settings-button"]').first();
  if (await phoneButton.isVisible()) {
    await phoneButton.click();
  } else {
    const more = page.getByRole("button", { name: "More controls" });
    await expect(more).toBeVisible();
    await more.click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
  }
  await expect(page.locator(".settings-page")).toBeVisible();
}
