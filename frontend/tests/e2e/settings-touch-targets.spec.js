/**
 * calvin-ip3l — touch targets on the settings pages.
 *
 * The kiosk browser (cog / WPE WebKit) does no touch adjustment, so a control
 * is only tappable where its own hit area reaches. This proves the switches
 * (and the other controls in the settings content) answer a 44x44 target at
 * both a 7" kiosk and a phone viewport, and that a switch never reaches into
 * the neighbouring row of the tight schedule table.
 *
 * Every route is answered by fixtures/api-mock.js, host-acting ones included.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import {
  closeSection,
  expectSettingsReady,
  gotoSettings,
  listSections,
  openSection,
  selectCategory,
} from "./phone/fixtures/navigation.js";
import {
  collectSwitchHitProblems,
  collectTouchTargetProblems,
  TOUCH_TARGET,
} from "./phone/fixtures/touch-targets.js";

const CATEGORIES = ["Content", "Dashboard", "Screens", "Plugins", "System", "Security"];

const CASES = [
  { name: "kiosk", viewport: { width: 1280, height: 720 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
];

for (const c of CASES) {
  test.describe(`settings touch targets at ${c.name}`, () => {
    test.use({ viewport: c.viewport });

    test("every switch and control answers a 44px hit box", async ({ page, consoleErrors }) => {
      const api = await installApiMock(page);
      await gotoSettings(page);
      await expectSettingsReady(page);

      let switchesChecked = 0;
      // A phone shows a long category one section at a time: audit each page.
      const audit = async label => {
        const hits = await collectSwitchHitProblems(page, ".settings-content");
        switchesChecked += hits.checked;
        expect(
          hits.problems,
          `${c.name}/${label}: switch centre or +/-20px misses the switch`
        ).toEqual([]);

        const problems = await collectTouchTargetProblems(page, ".settings-content");
        expect(problems, `${c.name}/${label}: controls under the ${TOUCH_TARGET}px target`).toEqual(
          []
        );
      };
      for (const category of CATEGORIES) {
        await selectCategory(page, category);
        await audit(category);
        for (const section of await listSections(page)) {
          await openSection(page, section);
          await audit(`${category}/${section}`);
          await closeSection(page);
        }
      }

      // The check would pass vacuously on a page with no switches.
      expect(switchesChecked).toBeGreaterThan(0);
      expect(api.hostActions).toEqual([]);
      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test("schedule rows keep each switch's target to its own row", async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page);
      await gotoSettings(page);
      await expectSettingsReady(page);
      await selectCategory(page, "Screens");

      await page.locator('[data-test="screen-default-card"]').click();
      await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
      await openSection(page, "device-power");

      const schedule = page.getByRole("switch", { name: "Screen on/off schedule" });
      if ((await schedule.getAttribute("aria-checked")) !== "true") await schedule.click();
      await expect(schedule).toHaveAttribute("aria-checked", "true");

      await page.locator('[data-test="schedule-change"]').click();
      const table = page.locator('[data-test="field-table"]');
      await expect(table).toBeVisible();

      // Split the week into one row per day so neighbouring switches are the
      // tightest case the table can produce.
      await page.getByRole("radio", { name: "Each day" }).click();
      await expect(table.locator('[role="switch"]')).toHaveCount(7);

      const hits = await collectSwitchHitProblems(page, '[data-test="field-table"]');
      expect(hits.checked).toBeGreaterThan(0);
      expect(hits.problems, `${c.name}: a schedule switch's 44px target crosses a row`).toEqual([]);

      // The rows are the touch target apart, so expanding the 24px track
      // vertically must not reach the switch above or below it.
      const gaps = await table.evaluate(el => {
        const switches = [...el.querySelectorAll('[role="switch"]')].map(node => {
          const r = node.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
        return switches.slice(1).map((s, i) => Math.round(s.top - switches[i].bottom));
      });
      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap, "schedule rows leave the switch hit area its own space").toBeGreaterThanOrEqual(
          TOUCH_TARGET - 24 - 1
        );
      }

      expect(api.hostActions).toEqual([]);
      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
