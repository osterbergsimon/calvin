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

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const TOKEN = "abc123.SAMPLETOKEN";
const GUEST = `/api/guest/${TOKEN}`;
// A 1x1 JPEG, enough for the file picker and the multipart body.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

/** Mock the guest routes of one link. Returns the recorded state. */
async function installGuestMock(page, { valid = true } = {}) {
  const state = { uploads: [], posts: 0, deleted: [], shareTarget: null };
  const thumb = id => ({
    imageId: id,
    uploadedAt: "2026-11-01T10:00:00Z",
    thumbnail: `${GUEST}/uploads/${id}/thumbnail`,
  });
  await page.route("**/api/guest/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!valid) return reply({ detail: { code: "share_link_invalid" } }, 404);
    if (path === GUEST) return reply({ name: "Grandma", available: true, maxBytes: 26214400 });
    if (path === `${GUEST}/manifest.webmanifest`) {
      return route.fulfill({
        status: 200,
        contentType: "application/manifest+json",
        body: JSON.stringify({
          name: "Add photos to Calvin",
          start_url: `/share/${TOKEN}/`,
          scope: `/share/${TOKEN}/`,
          display: "standalone",
          icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
          share_target: {
            action: `/share/${TOKEN}/receive`,
            method: "POST",
            enctype: "multipart/form-data",
            params: { files: [{ name: "photos", accept: ["image/*"] }] },
          },
        }),
      });
    }
    if (path === `${GUEST}/uploads` && method === "GET") return reply({ uploads: state.uploads });
    if (path === `${GUEST}/uploads` && method === "POST") {
      state.posts += 1;
      const added = thumb(`photo${state.posts}`);
      state.uploads = [added, ...state.uploads];
      return reply({ uploaded: [added], failed: [] });
    }
    const thumbMatch = path.match(/\/uploads\/([^/]+)\/thumbnail$/);
    if (thumbMatch) return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
    const removeMatch = path.match(/\/uploads\/([^/]+)$/);
    if (removeMatch && method === "DELETE") {
      state.deleted.push(removeMatch[1]);
      state.uploads = state.uploads.filter(u => u.imageId !== removeMatch[1]);
      return route.fulfill({ status: 204, body: "" });
    }
    return reply({}, 404);
  });
  // Android's Share › Calvin photos: a multipart POST navigation to the
  // manifest's share_target action, answered with a redirect to the page.
  await page.route(`**/share/${TOKEN}/receive`, async route => {
    const request = route.request();
    state.shareTarget = {
      method: request.method(),
      contentType: request.headers()["content-type"] || "",
      body: request.postDataBuffer()?.toString("latin1") || "",
    };
    state.uploads = [thumb("shared1"), ...state.uploads];
    return route.fulfill({
      status: 303,
      headers: { location: `/share/${TOKEN}/?added=1&failed=0` },
    });
  });
  return state;
}

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

    await page.locator('[data-test="share-link-revoke"]').click();
    await page.locator('[data-test="share-link-revoke-confirm"]').click();
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
    await expect(page.locator('[data-test="guest-invalid"]')).toContainText(
      "This link doesn't work any more"
    );
    await expect(page.locator('[data-test="guest-add"]')).toHaveCount(0);
    await expectPhoneLayout(page, "revoked share link");
  });
});
