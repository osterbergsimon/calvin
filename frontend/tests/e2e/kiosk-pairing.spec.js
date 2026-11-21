/**
 * Kiosk browser pairing hand-off and the pairing strip (Task 13, calvin-0xns).
 *
 * A kiosk unit opens `/?kiosk=…&khost=…#pair=clv_kiosk_…`. The page must remove
 * the fragment before any request, swap the secret once for the HttpOnly cookie,
 * and show the code it is given in the strip at the bottom edge. Every /api
 * route is intercepted by the phone suite's mock: no request reaches a server.
 */

import { expect, test } from "@playwright/test";
import { installApiMock } from "./phone/fixtures/api-mock.js";

const SECRET = `clv_kiosk_${"K".repeat(43)}`;
const CODE = "K7Q-4MD";

const PAIR = /^\/api\/kiosks\/kitchen\/pair$/;
const BROWSER_SESSION = /^\/api\/kiosks\/kitchen\/browser-session$/;
const KIOSK_CONFIG = /^\/api\/kiosks\/kitchen\/config$/;

/** Answer the hand-off and the poll; `pair` is read on every request. */
function installPairingMock(page, pair) {
  return installApiMock(page, {
    config: {
      kioskAuth: { state: "unpaired", mode: "optional", hasAgent: true, browser: "unknown" },
    },
    overrides: [
      [
        BROWSER_SESSION,
        route =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ state: "pending" }),
          }),
      ],
      [
        PAIR,
        route =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(pair.value),
          }),
      ],
      // The real kiosk config keeps its own kioskAuth; the default mock merges
      // the household config only.
      [
        KIOSK_CONFIG,
        route =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              orientation: "landscape",
              kioskAuth: {
                state: "unpaired",
                mode: "optional",
                hasAgent: true,
                browser: "unknown",
              },
            }),
          }),
      ],
    ],
  });
}

test("removes #pair before any request and shows the code until approval", async ({ page }) => {
  const pair = { value: { state: "pending", code: CODE, expiresAt: "2026-11-21T10:10:00Z" } };
  const api = await installPairingMock(page, pair);

  const requests = [];
  page.on("request", request =>
    requests.push({
      url: request.url(),
      referer: request.headers().referer || "",
      authorization: request.headers().authorization || "",
    })
  );

  // Boot order, pinned at request time: when the first /api call leaves the
  // page, the fragment must already be gone from the address bar (review of
  // PR #386, minor 8). A route handler that only checks page.url() afterwards
  // would miss a fragment removed after the first request.
  const urlsAtRequest = [];
  await page.route("**/api/**", async route => {
    urlsAtRequest.push(page.url());
    await route.fallback();
  });

  await page.goto(`/?kiosk=kitchen&khost=kiosk#pair=${SECRET}`);

  const strip = page.locator(".pairing-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator(".pairing-strip__code")).toHaveText(CODE);
  await expect(strip.locator(".pairing-strip__title")).toHaveText("Pair this screen");
  await expect(strip).toContainText(
    "On your phone or computer, open Settings › Screens in Calvin and type this code under Pair a screen."
  );

  // The secret left the address bar and never entered a URL or a Referer.
  // Router boot must not put the fragment back after its first navigation.
  await page.waitForTimeout(300);
  expect(urlsAtRequest.length).toBeGreaterThan(0);
  expect(urlsAtRequest[0]).not.toContain("#pair");
  expect(urlsAtRequest[0]).not.toContain("clv_kiosk_");
  expect(page.url()).not.toContain("#pair");
  expect(page.url()).not.toContain("clv_kiosk_");
  for (const request of requests) {
    expect(request.url).not.toContain("clv_kiosk_");
    expect(request.referer).not.toContain("clv_kiosk_");
  }

  // It was posted once, as a bearer, to browser-session.
  const handoffs = requests.filter(request => request.url.endsWith("/browser-session"));
  expect(handoffs).toHaveLength(1);
  expect(handoffs[0].authorization).toBe(`Bearer ${SECRET}`);
  expect(api.requests.filter(line => line.includes("/browser-session"))).toHaveLength(1);

  // The server's approval is seen by the next poll, and the strip goes away.
  pair.value = { state: "paired" };
  await expect(strip).toBeHidden({ timeout: 15000 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue("--pairing-strip-h"))
    )
    .toBe("0px");
});

test.describe("the strip stays on screen on the Settings route", () => {
  // G1: the strip shows on every route, Settings included. `.settings-page`
  // used to be a full 100dvh tall, so the strip was drawn just below the
  // screen, where a chromeless kiosk cannot scroll to it (design-lead F1).
  const frames = [
    { name: "settings-landscape", width: 800, height: 480 },
    { name: "settings-portrait", width: 480, height: 800 },
  ];

  for (const frame of frames) {
    test(`${frame.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: frame.width, height: frame.height });
      const pair = { value: { state: "pending", code: CODE, expiresAt: "2026-11-21T10:10:00Z" } };
      await installPairingMock(page, pair);

      await page.goto(`/settings?kiosk=kitchen&khost=kiosk#pair=${SECRET}`);

      const strip = page.locator(".pairing-strip");
      await expect(strip).toBeVisible();
      await expect(page.locator(".settings-page")).toBeVisible();
      await expect(page.locator(".settings-page")).toHaveClass(/settings-page--pinned/);

      const measured = await page.evaluate(() => {
        const rect = document.querySelector(".pairing-strip").getBoundingClientRect();
        const settings = document.querySelector(".settings-page");
        return {
          top: rect.top,
          bottom: rect.bottom,
          viewport: window.innerHeight,
          pageHeight: settings.getBoundingClientRect().height,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });

      // The whole strip is inside the viewport, and the page itself does not
      // scroll: Settings keeps its own scroll above the strip.
      expect(measured.top).toBeGreaterThanOrEqual(0);
      expect(measured.bottom).toBeLessThanOrEqual(measured.viewport + 1);
      expect(measured.pageHeight).toBeLessThanOrEqual(measured.viewport + 1);
      expect(measured.scrollHeight).toBe(measured.viewport);

      await page.screenshot({
        path: testInfo.outputPath(`pairing-strip-${frame.name}.png`),
        fullPage: false,
      });
    });
  }
});

test.describe("the strip takes its own space at the bottom edge", () => {
  const frames = [
    { name: "landscape-light", width: 800, height: 480, themeMode: "light" },
    { name: "landscape-dark", width: 800, height: 480, themeMode: "dark" },
    { name: "portrait-light", width: 480, height: 800, themeMode: "light" },
    { name: "portrait-dark", width: 480, height: 800, themeMode: "dark" },
  ];

  for (const frame of frames) {
    test(`${frame.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: frame.width, height: frame.height });
      const pair = { value: { state: "pending", code: CODE, expiresAt: "2026-11-21T10:10:00Z" } };
      await installApiMock(page, {
        config: {
          themeMode: frame.themeMode,
          kioskAuth: {
            state: "unpaired",
            mode: "optional",
            hasAgent: true,
            browser: "unknown",
          },
        },
        overrides: [
          [
            BROWSER_SESSION,
            route =>
              route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ state: "pending" }),
              }),
          ],
          [
            PAIR,
            route =>
              route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(pair.value),
              }),
          ],
        ],
      });

      await page.goto(`/?kiosk=kitchen&khost=kiosk#pair=${SECRET}`);
      const strip = page.locator(".pairing-strip");
      await expect(strip).toBeVisible();
      // The dashboard is a lazy route chunk: let it mount before measuring.
      await expect(page.locator(".dashboard")).toBeVisible();
      await expect(page.locator(".dashboard-region-section").first()).toBeVisible();
      // Let the dashboard's first paint settle (regions exist while their
      // content fades in); the measurements and screenshots then show it.
      await page.waitForTimeout(800);

      const measured = await page.evaluate(() => {
        const box = element => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const regions = [...document.querySelectorAll(".dashboard-region-section")];
        const bar = document.querySelector(".clock-bar-horizontal, .clock-bar-vertical");
        return {
          strip: box(document.querySelector(".pairing-strip")),
          dashboard: box(document.querySelector(".dashboard")),
          lastRegion: box(regions[regions.length - 1]),
          clockBar: box(bar),
          published: document.documentElement.style.getPropertyValue("--pairing-strip-h"),
          viewport: window.innerHeight,
          scrollHeight: document.body.scrollHeight,
        };
      });

      expect(measured.published).toBe(`${measured.strip.height}px`);
      expect(measured.strip.height).toBeGreaterThan(0);
      // The dashboard ends where the strip begins: the strip costs its own
      // height instead of covering a region, the clock bar or a button.
      expect(measured.dashboard.bottom).toBeLessThanOrEqual(measured.strip.top + 1);
      if (measured.lastRegion) {
        expect(measured.lastRegion.bottom).toBeLessThanOrEqual(measured.strip.top + 1);
      }
      if (measured.clockBar) {
        expect(measured.clockBar.bottom).toBeLessThanOrEqual(measured.strip.top + 1);
      }
      expect(measured.scrollHeight).toBeLessThanOrEqual(measured.viewport + 1);

      await page.screenshot({
        path: testInfo.outputPath(`pairing-strip-${frame.name}.png`),
        fullPage: false,
      });
    });
  }
});
