/**
 * The screen stack lays every dashboard screen on top of the same box and shows
 * one at a time (utils/screenStack.js). The unit tests run in jsdom, which has
 * no layout, so only a real browser can catch a stacked screen that keeps its
 * normal flow position and shrinks into half the width beside its sibling.
 *
 * The API is mocked by installApiMock: no request reaches a real Calvin.
 */

import { expect, test } from "@playwright/test";
import { installApiMock } from "./phone/fixtures/api-mock.js";

test("every stacked screen fills the stack box", async ({ page }) => {
  await installApiMock(page);
  await page.goto("/?screenStack=opacity");
  await expect(page.locator(".screen-stack--stacked")).toBeVisible();

  const stack = page.locator(".screen-stack--stacked");
  const views = stack.locator(":scope > .dashboard-view");
  await expect(views).toHaveCount(2);

  const measured = await page.evaluate(() => {
    const stackEl = document.querySelector(".screen-stack--stacked");
    const toRect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const viewEls = [...stackEl.querySelectorAll(":scope > .dashboard-view")];
    return {
      stack: toRect(stackEl),
      views: viewEls.map(toRect),
      positions: viewEls.map(view => getComputedStyle(view).position),
    };
  });

  // Both screens sit on the same box, and it is the whole stack box: the
  // bug squeezed each into half the width, side by side.
  expect(measured.positions).toEqual(["absolute", "absolute"]);
  for (const view of measured.views) {
    expect(Math.abs(view.x - measured.stack.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(view.y - measured.stack.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(view.width - measured.stack.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(view.height - measured.stack.height)).toBeLessThanOrEqual(1);
  }
});
