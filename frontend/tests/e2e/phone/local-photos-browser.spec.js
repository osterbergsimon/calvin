/**
 * calvin-n2my — the Local photos browser, on a phone.
 *
 * Content › Photos › Local photos opens the source's own sub-view: a thumbnail
 * grid, folder filters named from share links, upload and multi-select delete.
 * Every request is answered by the phone API mock; nothing reaches a real
 * Calvin and no host-acting route is allowed through.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const grandma = {
  id: "link1",
  name: "Grandma",
  folder: "Guests",
  createdAt: "2026-10-30T09:00:00Z",
  lastUsedAt: null,
  expiresAt: null,
  expired: false,
  uploadCount: 1,
  path: "/share/link1.SAMPLETOKEN/",
};

async function openBrowser(page) {
  const api = await installApiMock(page, {
    shareLinks: [grandma],
    shareFolders: ["Guests", "Party"],
  });
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Content");

  const row = page.locator('.content-settings [data-source-id="local-images"]');
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Manage photos" }).click();

  const browser = page.locator('[data-test="local-photos-browser"]');
  await expect(browser).toBeVisible();
  return { api, browser };
}

test.describe("phone: Local photos browser", () => {
  test("filters by folder, uploads and deletes a guest photo", async ({ page, consoleErrors }) => {
    const { api, browser } = await openBrowser(page);

    await expect(browser.getByRole("heading", { name: "Local photos" })).toBeVisible();
    await expect(browser.locator('[data-test="photo-tile"]')).toHaveCount(3);
    await expect(browser.getByRole("radio", { name: "All" })).toBeVisible();
    await expect(browser.getByRole("radio", { name: "Library" })).toBeVisible();
    await expect(browser.getByRole("radio", { name: "Grandma" })).toBeVisible();

    await browser.getByRole("radio", { name: "Grandma" }).click();
    await expect(browser.locator('[data-test="photo-tile"]')).toHaveCount(1);
    await expect(browser.locator('[data-test="photo-tile"]')).toContainText("party.jpg");
    await expect(browser.locator('[data-test="photo-tile"]')).toContainText("From Grandma");
    await expectPhoneLayout(page, "Local photos browser");

    await browser.getByRole("radio", { name: "Library" }).click();
    await expect(browser.locator('[data-test="photo-tile"]')).toHaveCount(2);
    await expect(browser).not.toContainText("From Grandma");

    // The browser reuses the one upload path: POST /api/images/upload.
    await browser.locator('[data-test="local-photos-input"]').setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      ),
    });
    await expect.poll(() => api.requests).toContain("POST /api/images/upload");
    await expect(browser.getByRole("status")).toContainText("Uploaded 1 photo");

    await browser.getByRole("radio", { name: "Grandma" }).click();
    await browser.getByRole("button", { name: "Select party.jpg" }).click();
    await browser.getByRole("button", { name: "Delete selected (1)" }).click();
    await expect(page.getByText("Delete party.jpg?")).toBeVisible();
    await page.locator('[data-test="confirm-accept"]').click();

    await expect(browser.locator('[data-test="photo-tile"]')).toHaveCount(0);
    expect(api.requests).toContain("DELETE /api/images/img-3");
    expect(api.hostActions).toEqual([]);

    await browser.getByRole("button", { name: "Back" }).click();
    await expect(page.locator('.content-settings [data-source-id="local-images"]')).toBeVisible();
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
