/**
 * CLV-110 — the clock bar and the calendar header at a 390px phone width.
 *
 * jsdom cannot lay out flex rows, so the static-CSS checks in
 * tests/unit/styles/narrowLayouts.spec.js only prove the rules exist. These
 * measure the real layout in Chromium: the screen dots never draw over the
 * centred time, and the calendar header keeps a readable month title with
 * every control inside the region.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { gotoDashboard } from "./fixtures/navigation.js";

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const visibleBox = async locator => {
  if (!(await locator.isVisible())) return null;
  const box = await locator.boundingBox();
  return box && box.width > 0 && box.height > 0 ? box : null;
};

test.describe("CLV-110 narrow clock bar and calendar header", () => {
  test("the clock bar's screen dots never draw over the time", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoDashboard(page);

    const time = page.locator(".clock-bar-horizontal .clock-time");
    await expect(time).toBeVisible();
    const timeBox = await visibleBox(time);
    expect(timeBox).not.toBeNull();

    // The time itself stays fully on screen.
    const width = await page.evaluate(() => window.innerWidth);
    expect(timeBox.x).toBeGreaterThanOrEqual(0);
    expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(width);

    // The sample config has two screens, so ScreenDots renders its buttons.
    const dots = page.locator(".clock-bar-horizontal .screen-dot");
    expect(await dots.count()).toBeGreaterThan(1);
    for (const dot of await dots.all()) {
      const box = await visibleBox(dot);
      if (box) expect(overlaps(box, timeBox), "a screen dot overlaps the time").toBe(false);
    }

    // Nothing else in the bar draws over the time either.
    const sides = page.locator(".clock-bar-horizontal .clock-bar-side > *");
    for (const item of await sides.all()) {
      const box = await visibleBox(item);
      if (box) expect(overlaps(box, timeBox), "a clock-bar item overlaps the time").toBe(false);
    }

    expect(api.hostActions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a narrow calendar region keeps the month title and every header control", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page);
    await gotoDashboard(page);

    const header = page.locator(".calendar-header").first();
    await expect(header).toBeVisible();
    const region = page.locator(".dashboard-region", { has: header }).first();
    const regionBox = await visibleBox(region);
    expect(regionBox).not.toBeNull();

    // The month title is rendered, readable (not squeezed to nothing) and
    // inside the region.
    const label = header.locator(".calendar-header__label");
    await expect(label).toBeVisible();
    await expect(label).not.toHaveText("");
    const labelBox = await visibleBox(label);
    expect(labelBox, "month title collapsed to nothing").not.toBeNull();
    // At least a few characters' worth: an ellipsis alone is not a title.
    const minTitle = await label.evaluate(el => 4 * parseFloat(getComputedStyle(el).fontSize));
    expect(labelBox.width).toBeGreaterThanOrEqual(minTitle);
    expect(labelBox.x).toBeGreaterThanOrEqual(regionBox.x - 0.5);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(regionBox.x + regionBox.width + 0.5);

    // Every control is visible, inside the region, and not covering the title.
    const controls = header.locator(".calendar-header__controls button");
    expect(await controls.count()).toBeGreaterThan(0);
    for (const control of await controls.all()) {
      const name =
        (await control.getAttribute("aria-label")) || (await control.textContent()) || "control";
      const box = await visibleBox(control);
      expect(box, `${name} is hidden or zero-sized`).not.toBeNull();
      expect(box.x, `${name} clips at the left edge`).toBeGreaterThanOrEqual(regionBox.x - 0.5);
      expect(box.x + box.width, `${name} clips at the right edge`).toBeLessThanOrEqual(
        regionBox.x + regionBox.width + 0.5
      );
      expect(box.y + box.height, `${name} clips at the bottom`).toBeLessThanOrEqual(
        regionBox.y + regionBox.height + 0.5
      );
      expect(overlaps(box, labelBox), `${name} covers the month title`).toBe(false);
    }

    expect(api.hostActions).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
