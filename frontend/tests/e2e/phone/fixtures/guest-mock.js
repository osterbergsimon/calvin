/**
 * calvin-mwqo — a mocked share link's guest routes, for the phone and a11y
 * specs. Nothing reaches a real Calvin.
 */

export const TOKEN = "abc123.SAMPLETOKEN";
export const GUEST = `/api/guest/${TOKEN}`;
// A 1x1 JPEG, enough for the file picker and the multipart body.
export const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

/** Mock the guest routes of one link. Returns the recorded state. */
export async function installGuestMock(
  page,
  { valid = true, expireOnUpload = false, seeAll = true } = {}
) {
  const state = {
    uploads: [],
    posts: 0,
    deleted: [],
    shareTarget: null,
    claims: [],
    claimed: 0,
    seeAll,
  };
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
    if (path === GUEST)
      return reply({
        name: "Grandma",
        expiresAt: null,
        available: true,
        maxBytes: 26214400,
        maxFiles: 50,
        seeAll: state.seeAll,
      });
    if (path === `${GUEST}/claim` && method === "POST") {
      const claim = request.postDataJSON()?.claim || "";
      state.claims.push(claim);
      if (!claim) return reply({ detail: { code: "invalid_claim" } }, 422);
      // The one pending share above can be claimed once; a repeat finds nothing.
      const claimed = state.shareTarget?.claim === claim && !state.claimed ? 1 : 0;
      state.claimed += claimed;
      return reply({ claimed });
    }
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
      // The link ran out while the page was open: the server now says 404.
      if (expireOnUpload) return reply({ detail: { code: "share_link_invalid" } }, 404);
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
    // The share sheet arrives without the phone's cookie, so the backend
    // parks its photo under a one-time claim carried back in the redirect.
    state.shareTarget = {
      method: request.method(),
      contentType: request.headers()["content-type"] || "",
      body: request.postDataBuffer()?.toString("latin1") || "",
      claim: "claim1",
    };
    state.uploads = [thumb("shared1"), ...state.uploads];
    return route.fulfill({
      status: 303,
      headers: { location: `/share/${TOKEN}/?added=1&failed=0&claim=claim1` },
    });
  });
  return state;
}
