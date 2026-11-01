/**
 * CLV-98 review: the fullscreen close (×) must stay on top of everything its
 * view draws, so a tap on it always reaches it:
 * - the calendar header (`--z-sticky`) spans the × corner, and a fullscreen
 *   calendar is neither focused nor dimmed, so its panel makes no stacking
 *   context of its own;
 * - a web page that refuses to embed shows a fallback card over the whole
 *   frame (IframeRenderer).
 * Each case hit-tests the middle of the × instead of trusting visibility.
 *
 * The API is mocked by installApiMock: host-acting routes are intercepted
 * there and never reach a real Calvin.
 */

import { expect, test } from "@playwright/test";
import { installApiMock } from "./phone/fixtures/api-mock.js";

/** Enter fullscreen through the mode store, like a region's fullscreen action. */
const enterFullscreen = (page, mode) =>
  page.evaluate(m => {
    const app = document.querySelector("#app").__vue_app__;
    app.config.globalProperties.$pinia._s.get("mode").enterFullscreen(m);
  }, mode);

/** The element at (x, y) is the × (or inside it). */
const hitsClose = (page, x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('[data-action="exit-fullscreen"]')
        ? "close"
        : el?.className || el?.tagName;
    },
    { x, y }
  );

/**
 * Hit-test the × at a point that `cover` also spans, so the test fails if
 * `cover` paints over it. Returns the box of the overlap it used.
 */
async function expectCloseAbove(page, scope, cover) {
  const close = page.locator(`${scope} [data-action="exit-fullscreen"]`);
  await expect(close).toBeVisible();
  const [a, b] = await Promise.all([close.boundingBox(), cover.boundingBox()]);
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  expect(right - left, "the cover spans the × horizontally").toBeGreaterThan(4);
  expect(bottom - top, "the cover spans the × vertically").toBeGreaterThan(4);
  expect(await hitsClose(page, (left + right) / 2, (top + bottom) / 2)).toBe("close");
}

const open = async (page, config = {}) => {
  await installApiMock(page, { config });
  // The sample web page must not reach the internet.
  await page.route("https://example.com/**", route => route.fulfill({ body: "<p>page</p>" }));
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await page.waitForLoadState("networkidle");
};

test("the fullscreen calendar's × sits above its header", async ({ page }) => {
  await open(page);
  await enterFullscreen(page, "calendar");
  // Today the header only loses because something above it happens to make a
  // stacking context: a focused or dimmed FocusPanel (transform / opacity), or
  // the identity transform `.calendar-content` keeps. Take those off so the ×
  // has to win on its own layer and order.
  await page.addStyleTag({
    content:
      ".focus-panel, .calendar-content { transform: none !important; opacity: 1 !important; filter: none !important; }",
  });
  const header = page.locator(".calendar-view--fullscreen .calendar-header");
  await expect(header).toBeVisible();
  await expectCloseAbove(page, ".calendar-view--fullscreen", header);
});

test("the fullscreen web page's × sits above an embed error", async ({ page }) => {
  await open(page);
  await enterFullscreen(page, "web_services");
  // The clock bar's ⋯ (a dashboard layer above the stage) also lands on this
  // corner, on develop too; that overlap is tracked separately. Hide it so this
  // test is only about the viewer's own layers.
  await page.addStyleTag({
    content:
      ".clock-bar-horizontal, .clock-bar-vertical, .admin-overflow { display: none !important; }",
  });
  const renderer = page.locator(".web-service-viewer.fullscreen .iframe-renderer");
  await expect(renderer).toBeAttached();
  // A page that refuses to embed shows the fallback card over the whole
  // frame; force that state on the renderer (dev build) instead of relying on
  // a real X-Frame-Options refusal.
  await renderer.evaluate(el => {
    el.__vueParentComponent.setupState.error = true;
  });
  const fallback = page.locator(".web-service-viewer.fullscreen .iframe-renderer__fallback");
  await expect(fallback).toBeVisible();
  await expectCloseAbove(page, ".web-service-viewer.fullscreen", fallback);
});
