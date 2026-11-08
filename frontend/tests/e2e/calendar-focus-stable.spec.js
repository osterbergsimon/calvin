/**
 * calvin-mbze: focusing the calendar must not resize it. The header controls
 * (Today, view switch, nav, fullscreen) only render while the region is focused;
 * on a narrow calendar they used to wrap onto a second row, so the grid lost a
 * row's height on focus and regained it on blur (a full relayout per tap).
 * The controls now overlay the header strip, so the grid keeps its box.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { gotoDashboard } from "./phone/fixtures/navigation.js";

const NARROW_CONFIG = {
  dashboardScreens: {
    version: 2,
    activeScreenId: "narrow",
    screens: [
      {
        id: "narrow",
        name: "Narrow",
        layout: {
          version: 1,
          preset: "split_three",
          regions: [
            { id: "region-1", kind: "calendar", instanceIds: [], size: 40 },
            { id: "region-2", kind: "photos", instanceIds: [], size: 30 },
            { id: "region-3", kind: "service", instanceIds: ["svc-recipes"], size: 30 },
          ],
        },
        activeRegionId: "region-2",
      },
    ],
  },
  availableScreens: ["narrow"],
  defaultScreenId: "narrow",
};

test.describe("calendar keeps its size when focused", () => {
  test.use({ viewport: { width: 800, height: 480 } });

  test("focusing the calendar region does not move or resize the grid", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, { config: NARROW_CONFIG });
    await gotoDashboard(page);

    const region = page
      .locator(".dashboard-region", { has: page.locator(".calendar-view") })
      .first();
    const grid = page.locator(".calendar-grid").first();
    const header = page.locator(".calendar-header").first();
    await expect(grid).toBeVisible();
    await expect(region.locator(".region-header-controls")).toBeHidden();

    // Geometry relative to the focus panel: the focus panel may lift the whole panel
    // by a couple of px (a transform, not a relayout); what must not change is
    // the size of the grid and header or where they sit inside the region.
    const measure = async () => {
      const r = await region.locator(".focus-panel").first().boundingBox();
      const g = await grid.boundingBox();
      const h = await header.boundingBox();
      return {
        grid: { w: g.width, h: g.height, dx: g.x - r.x, dy: g.y - r.y },
        header: { w: h.width, h: h.height, dx: h.x - r.x, dy: h.y - r.y },
      };
    };
    const before = await measure();

    const box = await region.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(region.locator(".region-header-controls")).toBeVisible();
    // Let the focus transition settle, then compare.
    await expect.poll(measure, { timeout: 3000 }).toEqual(before);

    // The controls stay inside the region.
    const controls = await region.locator(".region-header-controls").boundingBox();
    expect(controls.x).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(controls.x + controls.width).toBeLessThanOrEqual(box.x + box.width + 0.5);

    expect(api.hostActions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
