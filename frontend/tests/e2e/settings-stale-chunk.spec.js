/**
 * CLV-28 regression guard: a lazy route whose chunk cannot load must not leave
 * the app looking dead.
 *
 * The owner's symptom was "⋯ › Settings does nothing at all, but typing
 * /settings in the address bar works". That is the shape of a stale client: the
 * page was left open across a deploy, so the route's hashed chunk no longer
 * exists, the dynamic import 404s and Vue Router aborts the navigation without
 * changing anything on screen. A full load (the address bar) fetches the
 * current index.html and the current chunk names, which is why it worked.
 *
 * This spec blocks the Settings route module — the same failure — and asserts
 * the app recovers with a full navigation to the target route instead of
 * silently doing nothing.
 */

import { test, expect } from "@playwright/test";

const CONFIG = {
  orientation: "landscape",
  showUI: true,
  clockBarEnabled: true,
  clockBarMode: "horizontal",
  clockBarPosition: "top",
  clockBarShowInKiosk: true,
  regionsLocked: true,
  configPollInterval: 300,
  dashboardScreens: {
    version: 2,
    activeScreenId: "screen-home",
    screens: [
      {
        id: "screen-home",
        name: "Home",
        layout: {
          version: 1,
          preset: "split_two",
          regions: [
            { id: "region-1", kind: "calendar", serviceId: null, size: 70 },
            { id: "region-2", kind: "photos", serviceId: null, size: 30 },
          ],
        },
        activeRegionId: "region-1",
      },
    ],
  },
};

/**
 * Stub the whole API. The /api/system and /api/display routes act on the host
 * and are answered with a fake 401 so they can never reach a real backend.
 */
async function stubApi(page) {
  await page.route("**/api/system/**", route =>
    route.fulfill({ status: 401, json: { detail: "stubbed" } })
  );
  await page.route("**/api/display/**", route =>
    route.fulfill({ status: 401, json: { detail: "stubbed" } })
  );
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/config")) return route.fulfill({ json: CONFIG });
    if (pathname === "/api/auth/status") {
      return route.fulfill({ json: { configured: false, authenticated: false } });
    }
    if (pathname === "/api/plugins") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
}

test("a Settings chunk that cannot load recovers with a full navigation (CLV-28)", async ({
  page,
}) => {
  await stubApi(page);

  // The stale-chunk failure: the route module is gone (a deploy replaced it).
  await page.route("**/src/views/Settings.vue*", route =>
    route.fulfill({ status: 404, body: "Not Found" })
  );

  // A recovery is a full navigation, so count document loads.
  const documents = [];
  page.on("request", request => {
    if (request.resourceType() === "document") documents.push(new URL(request.url()).pathname);
  });

  await page.goto("/");
  await page.waitForSelector(".admin-overflow__trigger");

  await page.locator(".admin-overflow__trigger").first().click();
  await page.getByRole("menuitem", { name: "Settings" }).first().click();

  // The app must not stay silently on the dashboard: it does what the address
  // bar does, a full navigation to /settings (which reloads the current build).
  await expect(page).toHaveURL(/\/settings$/, { timeout: 10000 });
  await expect.poll(() => documents.filter(path => path === "/settings").length).toBeGreaterThan(0);
});
