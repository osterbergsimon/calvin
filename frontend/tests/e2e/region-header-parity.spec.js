/**
 * calvin-8nad review 5: calendar, photos and service headers are the same control
 * set. Measure all three on one dashboard at Dashboard size small and xlarge
 * (fine pointer), and prove every control surface shares the rail height and
 * control radius. Host actions are intercepted by the mock API.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { gotoDashboard } from "./phone/fixtures/navigation.js";

const PARITY_CONFIG = {
  dashboardScreens: {
    version: 2,
    activeScreenId: "parity",
    screens: [
      {
        id: "parity",
        name: "Parity",
        layout: {
          version: 1,
          preset: "split_three",
          regions: [
            { id: "region-1", kind: "calendar", instanceIds: [], size: 40 },
            { id: "region-2", kind: "photos", instanceIds: [], size: 30 },
            { id: "region-3", kind: "service", instanceIds: ["svc-recipes"], size: 30 },
          ],
        },
        activeRegionId: "region-1",
      },
    ],
  },
  availableScreens: ["parity"],
  defaultScreenId: "parity",
};

const RAIL = { small: 24, xlarge: 40 };

async function focusRegion(page, region) {
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(region.locator(".region-header-controls")).toBeVisible();
}

async function surfaceMetrics(region) {
  return region
    .locator(
      ".region-header-controls > button, .region-header-controls > .seg, .region-header-controls .region-view-options__trigger"
    )
    .evaluateAll(elements =>
      elements.map(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || "control",
          height: box.height,
          radius: style.borderTopLeftRadius,
        };
      })
    );
}

test.describe("region header control parity", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const size of ["small", "xlarge"]) {
    test(`${size}: calendar, photos and service share height and radius`, async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page, {
        config: { ...PARITY_CONFIG, touchControlSize: size },
      });
      await gotoDashboard(page);

      const regions = page.locator(".dashboard-region--leaf");
      await expect(regions).toHaveCount(3);

      const all = [];
      for (let index = 0; index < 3; index++) {
        const region = regions.nth(index);
        await focusRegion(page, region);
        const surfaces = await surfaceMetrics(region);
        expect(surfaces.length, `region ${index + 1} has no header controls`).toBeGreaterThan(0);
        all.push(...surfaces);
      }

      for (const surface of all) {
        expect(surface.height, `${surface.label} height`).toBeCloseTo(RAIL[size], 0);
        expect(surface.radius, `${surface.label} radius`).toBe("8px");
      }
      expect(new Set(all.map(surface => Math.round(surface.height))).size).toBe(1);
      expect(new Set(all.map(surface => surface.radius)).size).toBe(1);

      expect(api.hostActions).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
});
