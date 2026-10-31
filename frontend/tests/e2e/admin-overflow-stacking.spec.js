/**
 * CLV-24 regression guard: the dashboard admin overflow (⋯) trigger and its
 * menu must stay above the dashboard regions — including an empty photo
 * region — whichever perimeter clock bar hosts them.
 *
 * The dashboard raises `.dashboard-stage`/`.dashboard-main` above the bars so a
 * focused region's glow can bloom over them (8fdc8e2d). That only works while
 * the bars themselves paint above the region layer, so a bar that drops below
 * `.dashboard-main` swallows its own popover: the menu is still rendered (and
 * looks half-visible) but hits land on the region underneath. This spec opens
 * the menu in all four positions and hit-tests every item instead of trusting
 * visibility alone.
 */

import { test, expect } from "@playwright/test";

const REGIONS = [
  { id: "region-1", kind: "calendar", instanceIds: [], size: 50 },
  { id: "region-2", kind: "photos", instanceIds: [], size: 50 },
];

const configFor = (position, mode) => ({
  orientation: "landscape",
  showUI: true,
  clockBarEnabled: true,
  clockBarMode: mode,
  clockBarPosition: position,
  clockBarShowInKiosk: true,
  dashboardScreens: {
    version: 2,
    activeScreenId: "screen-home",
    screens: [
      {
        id: "screen-home",
        name: "Home",
        layout: { preset: "split_two", direction: "row", regions: REGIONS },
        activeRegionId: "region-1",
      },
    ],
  },
});

const POSITIONS = [
  { position: "top", mode: "horizontal" },
  { position: "bottom", mode: "horizontal" },
  { position: "left", mode: "vertical" },
  { position: "right", mode: "vertical" },
];

/**
 * Stub the whole API: this spec is about layout, not data. The /api/system and
 * /api/display routes are answered with a fake 401 and must never reach a real
 * backend (see the worker safety rules — those routes act on the host).
 */
async function stubApi(page, config) {
  await page.route("**/api/system/**", route =>
    route.fulfill({ status: 401, json: { detail: "stubbed" } })
  );
  await page.route("**/api/display/**", route =>
    route.fulfill({ status: 401, json: { detail: "stubbed" } })
  );
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/config") return route.fulfill({ json: config });
    if (pathname === "/api/auth/status") {
      return route.fulfill({ json: { authenticated: false } });
    }
    if (pathname === "/api/plugins") return route.fulfill({ json: [] });
    if (pathname.includes("/images") || pathname.includes("/calendar")) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: {} });
  });
}

/** True when the element at the point belongs to `selector`. */
function pointHits(page, x, y, selector) {
  return page.evaluate(
    ({ x, y, selector }) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el && el.closest(selector));
    },
    { x, y, selector }
  );
}

for (const { position, mode } of POSITIONS) {
  test(`admin overflow stays clickable above the regions — ${position} clock bar (CLV-24)`, async ({
    page,
  }) => {
    await stubApi(page, configFor(position, mode));
    await page.goto("/");
    await page.waitForSelector(".admin-overflow__trigger");

    // CLV-20's welcome card can sit over the regions; the guard is about the
    // region layer itself, so dismiss it and confirm the empty photo region
    // (the "overlay" from the report) is actually on screen underneath.
    const dismiss = page.locator('[data-test="setup-welcome-dismiss"]');
    if (await dismiss.count()) {
      await dismiss.first().click();
      await dismiss.first().waitFor({ state: "detached" });
    }
    await expect(page.locator('[data-test="empty-state"]').first()).toBeVisible();

    const trigger = page.locator(".admin-overflow__trigger").first();
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(
      await pointHits(
        page,
        triggerBox.x + triggerBox.width / 2,
        triggerBox.y + triggerBox.height / 2,
        ".admin-overflow__trigger"
      )
    ).toBe(true);

    await trigger.click();
    const menu = page.locator(".popover__panel");
    await expect(menu).toBeVisible();

    const items = menu.locator(".menu__item");
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThan(0);
    for (let i = 0; i < itemCount; i++) {
      const item = items.nth(i);
      const box = await item.boundingBox();
      expect(box, `menu item ${i} has a box`).not.toBeNull();
      const points = [
        [box.x + box.width / 2, box.y + box.height / 2],
        [box.x + 12, box.y + box.height / 2],
        [box.x + box.width - 12, box.y + box.height / 2],
      ];
      for (const [x, y] of points) {
        expect(
          await pointHits(page, x, y, ".popover__panel"),
          `menu item ${i} receives the pointer at ${Math.round(x)},${Math.round(y)}`
        ).toBe(true);
      }
    }

    // A real click is the thing the bug report was about: it must navigate.
    await menu.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
}
