/**
 * calvin-mwqo — share links for guest photo upload, on a phone.
 *
 * The owner creates a link in Settings › Content › Photos, re-shows its QR
 * code and revokes it; a guest opens the link, adds photos, removes one of
 * their own, and shares from Android's gallery (the Web Share Target POST).
 * The backend is mocked; nothing reaches a real Calvin.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";
import { GUEST, JPEG, TOKEN, installGuestMock } from "./fixtures/guest-mock.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.describe("phone: share links", () => {
  test("owner creates a link, re-shows its QR code and revokes it", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Content");

    const section = page.locator('[data-test="share-links"]');
    await section.getByRole("button", { name: "Create link" }).click();
    await page.locator("#share-link-name").fill("Grandma");
    await expect(page.locator("#share-link-folder")).toHaveValue("Guests");
    await page.locator('[data-test="share-link-submit"]').click();

    const qr = page.locator('[data-test="share-link-qr"]');
    await expect(qr).toBeVisible();
    await expect(qr.locator("img")).toBeVisible();
    await expect(qr).toContainText("/share/link1.SAMPLETOKEN/");
    await expectPhoneLayout(page, "share link with its QR code");

    // Hide it, then show it again: the URL is always available.
    await page.locator('[data-test="share-link-show"]').click();
    await expect(qr).toHaveCount(0);
    await page.locator('[data-test="share-link-show"]').click();
    await expect(page.locator('[data-test="share-link-qr"]')).toContainText(
      "/share/link1.SAMPLETOKEN/"
    );

    await page.getByRole("button", { name: "Revoke Grandma" }).click();
    await page.locator('[data-test="confirm-accept"]').click();
    await expect(page.locator('[data-test="share-link-row"]')).toHaveCount(0);
    expect(api.shareLinks).toEqual([]);
    expect(api.requests).toContain("DELETE /api/share/links/link1");
    expect(api.hostActions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("guest adds photos, sees them and removes one of their own", async ({
    page,
    consoleErrors,
  }) => {
    const guest = await installGuestMock(page);
    await page.goto(`/share/${TOKEN}/`);

    await expect(page.getByRole("heading", { name: "Add photos for Grandma" })).toBeVisible();
    const add = page.locator('[data-test="guest-add"]');
    await expect(add).toBeVisible();
    // Thumb-sized: the one control that matters.
    const box = await add.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(64);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      `${GUEST}/manifest.webmanifest`
    );
    // No dashboard or admin chrome on the guest page.
    await expect(page.locator(".app-shell")).toHaveCount(0);

    const chooser = page.waitForEvent("filechooser");
    await add.click();
    const picker = await chooser;
    expect(picker.isMultiple()).toBe(true);
    await picker.setFiles([
      { name: "one.jpg", mimeType: "image/jpeg", buffer: JPEG },
      { name: "two.jpg", mimeType: "image/jpeg", buffer: JPEG },
    ]);

    await expect(page.locator('[data-test="guest-status"]')).toContainText("2 photos added");
    await expect(page.locator('[data-test="guest-thumb"]')).toHaveCount(2);
    expect(guest.posts).toBe(2);
    await expectPhoneLayout(page, "guest page with uploads");

    await page.locator('[data-test="guest-remove"]').first().click();
    await page.locator('[data-test="confirm-accept"]').click();
    await expect(page.locator('[data-test="guest-thumb"]')).toHaveCount(1);
    expect(guest.deleted).toEqual(["photo2"]);
    expect(consoleErrors).toEqual([]);
  });

  test("sharing from the gallery posts to the share target and lands on the page", async ({
    page,
    consoleErrors,
  }) => {
    const guest = await installGuestMock(page);
    await page.goto(`/share/${TOKEN}/`);
    await expect(page.locator('[data-test="guest-add"]')).toBeVisible();

    // What Android does after Share › Calvin photos: a POST navigation with
    // the files under the manifest's param name.
    const manifest = await page.evaluate(
      async href => (await fetch(href)).json(),
      `${GUEST}/manifest.webmanifest`
    );
    const target = manifest.share_target;
    expect(target).toMatchObject({ method: "POST", enctype: "multipart/form-data" });
    await page.evaluate(
      ({ action, field, bytes }) => {
        const form = document.createElement("form");
        form.method = "post";
        form.enctype = "multipart/form-data";
        form.action = action;
        const input = document.createElement("input");
        input.type = "file";
        input.name = field;
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "IMG_20261101.jpg", { type: "image/jpeg" })
        );
        input.files = transfer.files;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      },
      { action: target.action, field: target.params.files[0].name, bytes: [...JPEG] }
    );

    await expect(page).toHaveURL(new RegExp(`/share/${TOKEN.replace(".", "\\.")}/$`));
    await expect(page.locator('[data-test="guest-status"]')).toContainText("1 photo added");
    await expect(page.locator('[data-test="guest-thumb"]')).toHaveCount(1);
    expect(guest.shareTarget.method).toBe("POST");
    expect(guest.shareTarget.contentType).toContain("multipart/form-data");
    expect(guest.shareTarget.body).toContain('name="photos"; filename="IMG_20261101.jpg"');
    expect(consoleErrors).toEqual([]);
  });

  test("a revoked link explains itself", async ({ page }) => {
    await installGuestMock(page, { valid: false });
    await page.goto(`/share/${TOKEN}/`);
    await expect(page.locator('[data-test="guest-invalid"]')).toBeVisible();
    await expect(page.locator('[data-test="guest-invalid"]')).toContainText(
      "This link doesn't work any more"
    );
    await expect(page.locator('[data-test="guest-add"]')).toHaveCount(0);
    await expectPhoneLayout(page, "revoked share link");
  });
});

test.describe("phone: share links that ran out", () => {
  test("an expired link explains itself when opened", async ({ page }) => {
    await installGuestMock(page, { valid: false });
    // What the share target redirect sends a dead link back to.
    await page.goto(`/share/${TOKEN}/?error=invalid`);
    await expect(page.locator('[data-test="guest-invalid"]')).toBeVisible();
    await expect(page.locator('[data-test="guest-invalid"]')).toContainText(
      "Ask the person who sent it for a new one."
    );
    await expect(page.locator('[data-test="guest-add"]')).toHaveCount(0);
  });

  test("a link that expires while the page is open stops taking photos", async ({
    page,
    consoleErrors,
  }) => {
    const guest = await installGuestMock(page, { expireOnUpload: true });
    await page.goto(`/share/${TOKEN}/`);
    const chooser = page.waitForEvent("filechooser");
    await page.locator('[data-test="guest-add"]').click();
    await (await chooser).setFiles([{ name: "one.jpg", mimeType: "image/jpeg", buffer: JPEG }]);

    await expect(page.locator('[data-test="guest-invalid"]')).toBeVisible();
    await expect(page.locator('[data-test="guest-invalid"]')).toContainText(
      "This link doesn't work any more"
    );
    await expect(page.locator('[data-test="guest-add"]')).toHaveCount(0);
    expect(guest.posts).toBe(0);
    await expectPhoneLayout(page, "expired share link");
    expect(consoleErrors.filter(line => !line.includes("404"))).toEqual([]);
  });
});
