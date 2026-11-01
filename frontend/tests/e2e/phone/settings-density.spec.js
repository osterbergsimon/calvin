/**
 * Settings density guards (docs/design/2026-11-01-screen-schedule.md §4, §5).
 *
 * Runs on the mocked harness only: every /api call is answered by page.route,
 * so nothing reaches a real backend and no host-acting route can fire.
 *
 *  - a SettingRow with a toggle, segmented control or select stays side by side
 *    with its label at 1280, and is never taller than 120px;
 *  - the collapsed schedule block (the on/off row plus the Schedule summary)
 *    stays under 260px at 1280 and 390 — it was 1,680px before the editor.
 */
import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

const WEEK = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  day,
  enabled: true,
  onTime: "06:00",
  offTime: "22:00",
}));

async function openSettings(page, category = null) {
  await installApiMock(page, {
    config: { displayScheduleEnabled: true, displaySchedule: WEEK },
  });
  await gotoSettings(page);
  await expectSettingsReady(page);
  if (category) await selectCategory(page, category);
}

/** Rows with a toggle / segmented control / select in their control column. */
function compactRows(page) {
  return page.$$eval(".setting-row:not(.setting-row--stacked)", rows =>
    rows
      .filter(row => row.offsetParent !== null)
      .filter(row =>
        row.querySelector(
          ".setting-row__control [role='switch'], .setting-row__control [role='radiogroup'], .setting-row__control .pill-wrap"
        )
      )
      .map(row => {
        const label = row.querySelector(".setting-row__label");
        const control = row.querySelector(".setting-row__control");
        const line = label.getBoundingClientRect();
        const box = control.getBoundingClientRect();
        return {
          label: label?.textContent.trim() || "",
          height: Math.round(row.getBoundingClientRect().height),
          sideBySide: box.top < line.bottom && box.bottom > line.top,
        };
      })
  );
}

test.describe("settings density at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  test("compact rows stay beside their label and under 120px", async ({ page }) => {
    await openSettings(page);

    await selectCategory(page, "Dashboard");
    const dashboardRows = await compactRows(page);
    expect(dashboardRows.length).toBeGreaterThan(0);
    for (const row of dashboardRows) {
      expect(row.height, `Dashboard: ${row.label} is too tall`).toBeLessThanOrEqual(120);
      expect(row.sideBySide, `Dashboard: ${row.label} stacked its control`).toBe(true);
    }

    await selectCategory(page, "Screens");
    await page.locator("[data-test='screen-default-card']").click();
    await expect(page.locator("[data-test='default-screen-page']")).toBeVisible();
    const defaultRows = await compactRows(page);
    expect(defaultRows.length).toBeGreaterThan(0);
    for (const row of defaultRows) {
      expect(row.height, `Default: ${row.label} is too tall`).toBeLessThanOrEqual(120);
      expect(row.sideBySide, `Default: ${row.label} stacked its control`).toBe(true);
    }
  });

  test("a screen's page keeps its compact rows side by side too", async ({ page }) => {
    await openSettings(page, "Screens");
    await page.locator("[data-test='screen-card']").first().click();
    await expect(page.locator("[data-test='screens-detail']")).toBeVisible();

    for (const row of await compactRows(page)) {
      expect(row.height, `screen: ${row.label} is too tall`).toBeLessThanOrEqual(120);
      expect(row.sideBySide, `screen: ${row.label} stacked its control`).toBe(true);
    }
  });
});

for (const [name, viewport] of [
  ["1280", { width: 1280, height: 900 }],
  ["390", PHONE],
]) {
  test.describe(`collapsed schedule at ${name}`, () => {
    test.use({
      viewport,
      hasTouch: name === "390",
      isMobile: name === "390",
    });

    test("the schedule block stays under 260px", async ({ page }) => {
      await openSettings(page, "Screens");
      await page.locator("[data-test='screen-default-card']").click();
      await expect(page.locator("[data-test='default-screen-page']")).toBeVisible();

      const height = await page.evaluate(() => {
        const toggleRow = [...document.querySelectorAll("#section-device-power .setting-row")].find(
          row => row.textContent.includes("Screen on/off schedule")
        );
        const schedule = document.querySelector("[data-test='display-schedule']");
        if (!toggleRow || !schedule) return null;
        return Math.round(
          toggleRow.getBoundingClientRect().height + schedule.getBoundingClientRect().height
        );
      });
      expect(height).not.toBeNull();
      expect(height, "the collapsed schedule block").toBeLessThanOrEqual(260);

      // The summary is the one row the collapsed editor shows.
      await expect(page.locator("[data-test='schedule-summary']")).toHaveText(
        "On 06:00 · off 22:00, every day"
      );
      await expect(page.locator("[data-test='field-table']")).toHaveCount(0);
    });
  });
}
