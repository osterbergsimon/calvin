/**
 * The screen stack lays every dashboard screen on top of the same box and shows
 * one at a time (utils/screenStack.js). The tests switch the stack on with the
 * `?screenStack=on` URL override; the real switch is a kiosk's Faster page
 * switching setting. The unit tests run in jsdom, which has
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

/** An event on today, so the month grid has something to open. */
const todayEvent = () => {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(10, 0, 0, 0);
  return {
    id: "evt-today",
    title: "Stacked dialog check",
    start: start.toISOString(),
    end: end.toISOString(),
    all_day: false,
    source: "src-family",
    color: "green",
  };
};

test("every stacked screen fills the stack box", async ({ page }) => {
  await installApiMock(page);
  await page.goto("/?screenStack=on");
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
 * box makes the browser restyle and lay out all N screens on wake.
 */
{
  test("keeps every stacked screen laid out while a fullscreen view is open", async ({ page }) => {
    await installApiMock(page);
    await page.goto("/?screenStack=on");
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
      // Paint order, topmost first. elementsFromPoint ignores pointer-events,
      // so it reports which of the two actually paints on top; elementFromPoint
      // alone cannot, because the stack takes no input either way.
      const atPoint = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      const topmost = atPoint.find(
        element => element.closest(".screen-stack") || element.closest(".fullscreen-mode")
      );
      return {
        stackDisplay: stackStyle.display,
        stackPointerEvents: stackStyle.pointerEvents,
        stack: rect(stackEl),
        views: views.map(view => ({
          ...rect(view),
          visibility: getComputedStyle(view).visibility,
        })),
        sections: sections.map(rect),
        hitIsFullscreen: Boolean(hit?.closest(".fullscreen-mode")),
        hitIsStack: Boolean(hit?.closest(".screen-stack")),
        topmostIsFullscreen: Boolean(topmost?.closest(".fullscreen-mode")),
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
      expect(view.visibility).toBe("hidden");
    }

    // The fullscreen view paints above the stack (the overlay carries the
    // z-index; the stack still comes later in the DOM) and takes the input.
    expect(measured.topmostIsFullscreen).toBe(true);
    expect(measured.hitIsFullscreen).toBe(true);
    expect(measured.hitIsStack).toBe(false);
  });
}

/**
 * Bottom clock bar: the fullscreen view overlays the screens inside their own
 * cell, and the clock bar is a sibling of that cell. So the clock bar keeps
 * its row, and the stack keeps the exact box it had before fullscreen opened —
 * a box that changed re-lays out every screen on enter and on wake. Before,
 * the stack was absolutely positioned over `.dashboard-main` (clock bar
 * included) and grew by the bar's height.
 */
{
  test("keeps the stack's box and clears a bottom clock bar when fullscreen opens", async ({
    page,
  }) => {
    await installApiMock(page, { config: { clockBarPosition: "bottom" } });
    await page.goto("/?screenStack=on");
    await expect(page.locator(".screen-stack--stacked")).toBeVisible();
    await expect(page.locator(".screen-stack--stacked > .dashboard-view")).toHaveCount(2);

    const clockBar = page.locator(".clock-bar-horizontal.position-bottom");
    await expect(clockBar).toBeVisible();

    const measure = () =>
      page.evaluate(() => {
        const rect = element => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        const stackEl = document.querySelector(".screen-stack--stacked");
        const barEl = document.querySelector(".clock-bar-horizontal.position-bottom");
        const fullscreenEl = document.querySelector(".fullscreen-mode");
        const barHit = document.elementFromPoint(
          barEl.getBoundingClientRect().x + barEl.getBoundingClientRect().width / 2,
          barEl.getBoundingClientRect().y + barEl.getBoundingClientRect().height / 2
        );
        return {
          stack: rect(stackEl),
          bar: rect(barEl),
          fullscreen: fullscreenEl ? rect(fullscreenEl) : null,
          barTakesInput: Boolean(barHit?.closest(".clock-bar-horizontal")),
        };
      });

    const normal = await measure();
    expect(normal.stack.height).toBeGreaterThan(0);
    // The clock bar sits under the stack, edge to edge at most.
    expect(normal.stack.y + normal.stack.height).toBeLessThanOrEqual(normal.bar.y + 1);
    expect(normal.barTakesInput).toBe(true);

    await enterFullscreen(page, "photos");
    await expect(page.locator(".fullscreen-mode .photo-slideshow.fullscreen")).toBeVisible();
    await expect(clockBar).toBeVisible();

    const fullscreen = await measure();

    // Same box to the pixel: opening fullscreen must not re-lay out the screens.
    for (const side of ["x", "y", "width", "height"]) {
      expect(Math.abs(fullscreen.stack[side] - normal.stack[side])).toBeLessThanOrEqual(1);
    }
    // The overlay is the same cell the stack fills, and it does not take the
    // clock bar's row either: the bar stays visible and hit-testable.
    expect(fullscreen.fullscreen).not.toBeNull();
    for (const side of ["x", "y", "width", "height"]) {
      expect(Math.abs(fullscreen.fullscreen[side] - fullscreen.stack[side])).toBeLessThanOrEqual(1);
    }
    expect(fullscreen.stack.y + fullscreen.stack.height).toBeLessThanOrEqual(fullscreen.bar.y + 1);
    expect(fullscreen.fullscreen.y + fullscreen.fullscreen.height).toBeLessThanOrEqual(
      fullscreen.bar.y + 1
    );
    expect(fullscreen.barTakesInput).toBe(true);
  });
}

/**
 * Region dialogs stay on the viewport. `EventDetailPanel` is `position: fixed`
 * and `DialogScrim` is `inset: 0`; both are rendered inside a dashboard region.
 * Stacked screens are contained (layout paint) to isolate a hidden screen's
 * repaints, but containment also makes the element the containing block for
 * fixed descendants and clips them. Applied to the active screen too, the
 * dialog centred on the dashboard box (shifted by the clock bar's height) and
 * the scrim stopped covering the clock bars. Only hidden screens may contain.
 */
test("keeps a region dialog on the viewport, not on the dashboard box", async ({ page }) => {
  await installApiMock(page, {
    overrides: [
      [
        /^\/api\/calendar\/events$/,
        route =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ events: [todayEvent()] }),
          }),
      ],
    ],
  });

  // Open the event on the active screen and measure its scrim and panel, plus
  // the dashboard box they used to be contained by.
  const openAndMeasure = async url => {
    await page.goto(url);
    await expect(page.locator(".screen-stack--stacked, .screen-stack")).toBeVisible();
    // A timed event is a `.timed-event` chip in the month grid.
    const item = page.locator(".dashboard-view.is-active-screen .timed-event").first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(
      page.locator(".dashboard-view.is-active-screen .event-detail-panel")
    ).toBeVisible();

    return page.evaluate(() => {
      const box = element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      const view = document.querySelector(".dashboard-view.is-active-screen");
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        view: box(view),
        scrim: box(view.querySelector(".dialog-scrim")),
        panel: box(view.querySelector(".event-detail-panel")),
      };
    });
  };

  const stacked = await openAndMeasure("/?screenStack=on");
  const plain = await openAndMeasure("/");

  // With the stack on, the scrim still covers the whole viewport (clock bars
  // included) and the panel is centred on it — exactly like with the stack off.
  for (const side of ["x", "y", "width", "height"]) {
    expect(Math.abs(stacked.scrim[side] - plain.scrim[side])).toBeLessThanOrEqual(1);
    expect(Math.abs(stacked.panel[side] - plain.panel[side])).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(stacked.scrim.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stacked.scrim.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(stacked.scrim.width - stacked.viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stacked.scrim.height - stacked.viewport.height)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(stacked.panel.x + stacked.panel.width / 2 - stacked.viewport.width / 2)
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(stacked.panel.y + stacked.panel.height / 2 - stacked.viewport.height / 2)
  ).toBeLessThanOrEqual(1);
  // The dashboard box the dialog was wrongly contained by is smaller than the
  // viewport: the clock bar takes its own row, so this test is not vacuous.
  expect(stacked.view.height).toBeLessThan(stacked.viewport.height);
});
