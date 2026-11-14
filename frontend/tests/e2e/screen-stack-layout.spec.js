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

/** Enter fullscreen through the mode store, like a region's fullscreen action. */
const enterFullscreen = (page, mode) =>
  page.evaluate(m => {
    const app = document.querySelector("#app").__vue_app__;
    app.config.globalProperties.$pinia._s.get("mode").enterFullscreen(m);
  }, mode);

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

/**
 * The photo frame keeps the dashboard mounted underneath it so a wake does not
 * rebuild every screen. It must stay laid out (not display:none): a vanished
 * box makes the browser restyle and lay out all N screens on wake, and in
 * opacity mode refuses the tiles the hidden screens kept.
 */
for (const mode of ["opacity", "visibility"]) {
  test(`keeps every stacked screen laid out while a fullscreen view is open (${mode})`, async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto(`/?screenStack=${mode}`);
    await expect(page.locator(".screen-stack--stacked")).toBeVisible();
    await expect(page.locator(".screen-stack--stacked > .dashboard-view")).toHaveCount(2);

    await enterFullscreen(page, "photos");
    await expect(page.locator(".fullscreen-mode .photo-slideshow.fullscreen")).toBeVisible();

    const measured = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const stackEl = document.querySelector(".screen-stack--stacked");
      const stackStyle = getComputedStyle(stackEl);
      const views = [...stackEl.querySelectorAll(":scope > .dashboard-view")];
      const sections = views.flatMap(view => [
        ...view.querySelectorAll(".dashboard-region-section"),
      ]);
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return {
        stackDisplay: stackStyle.display,
        stackPointerEvents: stackStyle.pointerEvents,
        stack: rect(stackEl),
        views: views.map(view => ({
          ...rect(view),
          opacity: getComputedStyle(view).opacity,
          visibility: getComputedStyle(view).visibility,
        })),
        sections: sections.map(rect),
        hitIsFullscreen: Boolean(hit?.closest(".fullscreen-mode")),
        hitIsStack: Boolean(hit?.closest(".screen-stack")),
      };
    });

    // Laid out, behind the fullscreen view: a display:none stack has no boxes,
    // and every region width measured 0 during the photo frame before this.
    expect(measured.stackDisplay).not.toBe("none");
    expect(measured.stack.width).toBeGreaterThan(0);
    expect(measured.stack.height).toBeGreaterThan(0);
    expect(measured.stackPointerEvents).toBe("none");
    expect(measured.sections.length).toBeGreaterThan(0);
    for (const section of measured.sections) {
      expect(section.width).toBeGreaterThan(0);
      expect(section.height).toBeGreaterThan(0);
    }
    // The screens still fill the same box as the visible dashboard would.
    for (const view of measured.views) {
      expect(Math.abs(view.width - measured.stack.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(view.height - measured.stack.height)).toBeLessThanOrEqual(1);
      if (mode === "opacity") {
        expect(view.opacity).toBe("0");
      } else {
        expect(view.visibility).toBe("hidden");
      }
    }

    // The fullscreen view still covers the stack and takes the input.
    expect(measured.hitIsFullscreen).toBe(true);
    expect(measured.hitIsStack).toBe(false);
  });
}
