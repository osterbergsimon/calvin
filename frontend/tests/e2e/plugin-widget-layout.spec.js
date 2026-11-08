/**
 * calvin-xxe3: schema-driven plugin widgets (CardGrid, StatusRenderer,
 * WeatherForecast, ItemList, MetricDashboard, ImageWithCaption) must
 *  1. keep the region header clear of their content,
 *  2. fill their region at any size without silently cutting content off,
 *  3. apply the region's view options (card size, link behaviour, refresh).
 *
 * Real renderers, realistic payloads served through the API mock. Host actions
 * stay intercepted by the mock; nothing reaches a real server.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { WIDGETS, SIZES, widgetOverrides } from "./fixtures/plugin-widgets.js";

async function openWidget(page, key, size, { view, kiosk = null } = {}) {
  const hits = { data: 0 };
  const widget = widgetOverrides(key, hits);
  if (view) widget.config.dashboardScreens.screens[0].layout.regions[0].view = view;
  await page.setViewportSize(SIZES[size]);
  const api = await installApiMock(page, { config: widget.config, overrides: widget.overrides });
  await page.goto(kiosk ? `/?kiosk=${encodeURIComponent(kiosk)}` : "/");
  await page.waitForLoadState("networkidle");
  const region = page.locator(".dashboard-region--leaf").first();
  await expect(region.locator(WIDGETS[key].unit).first()).toBeVisible();
  // Focus the region so its header (title and controls) is revealed. Click its
  // bottom edge: the middle may be a link that opens an overlay.
  const box = await region.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
  await expect(page.locator(".dashboard-panel__header")).toBeVisible();
  // Let the fit-clamp and fonts settle.
  await page.waitForTimeout(400);
  return { api, hits, region };
}

/** Geometry of the header, the panel body and every content unit. */
function measure(page, unitSelector) {
  return page.evaluate(unit => {
    const rect = el => {
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    const header = document.querySelector(".dashboard-panel__header");
    const body = document.querySelector(".dashboard-panel__body");
    const bodyRect = rect(body);
    const scrollable = el => {
      for (let node = el.parentElement; node && node !== body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight)
          return true;
      }
      return false;
    };
    const units = [...document.querySelectorAll(unit)].map(el => ({
      ...rect(el),
      scrollable: scrollable(el),
    }));
    return { header: rect(header), body: bodyRect, units };
  }, unitSelector);
}

const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

test.describe("plugin widgets in a region", () => {
  for (const key of Object.keys(WIDGETS)) {
    for (const size of Object.keys(SIZES)) {
      test(`${WIDGETS[key].label} at ${size}: header clears content, content fills, nothing is cut`, async ({
        page,
        consoleErrors,
      }) => {
        const { api } = await openWidget(page, key, size);
        const m = await measure(page, WIDGETS[key].unit);
        expect(m.units.length, "content rendered").toBeGreaterThan(0);

        // 1. The header box never touches a content unit that is on screen.
        for (const [i, unit] of m.units.entries()) {
          expect(
            overlapArea(m.header, unit),
            `header overlaps content unit ${i} (header ${m.header.top}-${m.header.bottom}, unit ${unit.top}-${unit.bottom})`
          ).toBe(0);
        }

        // 2. Content fills the region: its visible extent reaches the body's
        //    far edges (one gutter of slack), or the content scrolls.
        const slack = 40;
        const reachesBottom = m.units.some(
          unit => Math.min(unit.bottom, m.body.bottom) >= m.body.bottom - slack
        );
        const reachesRight = m.units.some(unit => unit.right >= m.body.right - slack);
        expect(reachesBottom, "content reaches the bottom of the region").toBe(true);
        expect(reachesRight, "content reaches the right edge of the region").toBe(true);

        // 3. Nothing is cut off silently: a unit that leaves the body is
        //    reachable by scrolling.
        for (const [i, unit] of m.units.entries()) {
          const inside = unit.top >= m.body.top - 1 && unit.bottom <= m.body.bottom + 1;
          expect(inside || unit.scrollable, `content unit ${i} is cut off without scroll`).toBe(
            true
          );
        }

        expect(api.hostActions).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  }
});

test.describe("region view options reach the widget", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const cardWidth = page =>
    page
      .locator(".card-grid__card")
      .first()
      .evaluate(el => el.getBoundingClientRect().width);

  test("Card size changes the card footprint and is saved", async ({ page }) => {
    const { api } = await openWidget(page, "mealie", "medium");
    const before = await cardWidth(page);

    await page.locator(".region-view-options__trigger").click();
    await page.getByRole("dialog").locator("button.pill").click();
    await page.getByRole("option", { name: "X-Large" }).click();

    await expect.poll(() => cardWidth(page)).toBeGreaterThan(before + 40);
    const saved = api.configPosts.at(-1)?.dashboardScreens?.screens?.[0]?.layout?.regions?.[0];
    expect(saved?.view?.cardSize).toBe("xlarge");
  });

  test("Link behavior Off makes the items inert", async ({ page }) => {
    const { api } = await openWidget(page, "mealie", "medium");
    await expect(page.locator(".card-grid__item--clickable").first()).toBeVisible();

    await page.locator(".region-view-options__trigger").click();
    await page.getByRole("dialog").getByText("Off", { exact: true }).click();

    await expect(page.locator(".card-grid__item--clickable")).toHaveCount(0);
    const saved = api.configPosts.at(-1)?.dashboardScreens?.screens?.[0]?.layout?.regions?.[0];
    expect(saved?.view?.linkAction).toBe("off");
  });

  test("Refresh now fetches the widget's data again", async ({ page }) => {
    const { hits } = await openWidget(page, "mealie", "medium");
    const before = hits.data;

    await page.locator(".region-view-options__trigger").click();
    await page.locator("[data-action=refresh-now]").click();

    await expect.poll(() => hits.data).toBeGreaterThan(before);
  });

  test("Item lists offer no Card size they would ignore", async ({ page }) => {
    await openWidget(page, "list", "medium");
    await page.locator(".region-view-options__trigger").click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Link behavior")).toBeVisible();
    await expect(panel.getByText("Card size")).toHaveCount(0);
  });
});

test.describe("link behavior reaches a tapped Mealie item", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // [option shown in the menu, view.linkAction it saves, overlay a tap opens]
  const CHOICES = [
    ["Default", undefined, "handoff"],
    ["QR", "handoff", "handoff"],
    ["In-app", "embed", "embed"],
    ["Off", "off", "none"],
  ];

  for (const [label, saved, overlay] of CHOICES) {
    test(`${label} -> ${overlay}`, async ({ page }) => {
      // Start from the opposite of the choice so selecting it is a real change.
      const start = label === "Off" ? "embed" : "off";
      const { api } = await openWidget(page, "mealie", "medium", {
        view: { linkAction: start },
      });
      await page.locator(".region-view-options__trigger").click();
      await page.getByRole("dialog").getByText(label, { exact: true }).click();
      await expect
        .poll(
          () =>
            api.configPosts.at(-1)?.dashboardScreens?.screens?.[0]?.layout?.regions?.[0]?.view
              ?.linkAction
        )
        .toBe(saved);

      await page.keyboard.press("Escape");
      const item = page.locator(".card-grid__item").first();
      await item.click();
      const qr = page.getByText("Scan to open on your phone");
      const embed = page.getByRole("dialog", { name: "Embedded page" });
      if (overlay === "handoff") await expect(qr).toBeVisible();
      else await expect(qr).toHaveCount(0);
      if (overlay === "embed") await expect(embed).toBeVisible();
      else await expect(embed).toHaveCount(0);
    });
  }
});

test.describe("Card size steps are all visible", () => {
  // At a region wider than its cards every step leaves the card width alone, so
  // the text size must be what changes.
  test.use({ viewport: { width: 2560, height: 1440 } });

  test("each size step changes the card text, padding and never the default", async ({ page }) => {
    const sizes = ["xsmall", "small", "medium", "large", "xlarge"];
    const seen = [];
    for (const cardSize of sizes) {
      await openWidget(page, "mealie", "large", { view: { cardSize } });
      seen.push(
        await page
          .locator(".card-grid__card")
          .first()
          .evaluate(card => ({
            text: parseFloat(
              getComputedStyle(card.querySelector(".card-grid__item-value")).fontSize
            ),
            pad: parseFloat(getComputedStyle(card).paddingTop),
          }))
      );
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].text, `${sizes[i]} text is larger than ${sizes[i - 1]}`).toBeGreaterThan(
        seen[i - 1].text
      );
      expect(seen[i].pad, `${sizes[i]} padding is larger than ${sizes[i - 1]}`).toBeGreaterThan(
        seen[i - 1].pad
      );
    }
  });
});

test.describe("the region's options follow the widget into fullscreen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Card size and Link behavior still apply when the region goes fullscreen", async ({
    page,
  }) => {
    await openWidget(page, "mealie", "medium", { view: { cardSize: "xlarge", linkAction: "off" } });
    await page.getByRole("button", { name: "Enter Fullscreen" }).click();
    await expect(page.locator(".web-service-viewer.fullscreen")).toBeVisible();
    const card = page.locator(".web-service-viewer.fullscreen .card-grid__card").first();
    await expect(card).toBeVisible();
    expect(await card.evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeCloseTo(
      22.4,
      0
    );
    await expect(
      page.locator(".web-service-viewer.fullscreen .card-grid__item--clickable")
    ).toHaveCount(0);
  });
});

test.describe("item lists take Link behavior too", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Link behavior Off makes feed rows inert", async ({ page }) => {
    await openWidget(page, "list", "medium");
    await expect(page.locator(".item-list__row--clickable").first()).toBeVisible();
    await page.locator(".region-view-options__trigger").click();
    await page.getByRole("dialog").getByText("Off", { exact: true }).click();
    await expect(page.locator(".item-list__row--clickable")).toHaveCount(0);
  });
});

test.describe("link behavior on a kiosk (links never leave Calvin)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  const tapItem = async page => page.locator(".card-grid__item").first().click();
  const choose = async (page, label) => {
    await page.locator(".region-view-options__trigger").click();
    await page.getByRole("dialog").getByText(label, { exact: true }).click();
    await page.keyboard.press("Escape");
  };
  const qr = page => page.getByText("Scan to open on your phone");
  const embed = page => page.getByRole("dialog", { name: "Embedded page" });

  test("Default and QR show the QR code with an Open here button", async ({ page }) => {
    await openWidget(page, "mealie", "medium", { kiosk: "pi-panel", view: { linkAction: "off" } });
    for (const label of ["QR", "Default"]) {
      await choose(page, label);
      await tapItem(page);
      await expect(qr(page), label).toBeVisible();
      await expect(page.getByRole("button", { name: "Open here" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(qr(page)).toHaveCount(0);
    }
  });

  test("In-app opens the page inside Calvin", async ({ page }) => {
    await openWidget(page, "mealie", "medium", { kiosk: "pi-panel" });
    await choose(page, "In-app");
    await tapItem(page);
    await expect(embed(page)).toBeVisible();
    await expect(qr(page)).toHaveCount(0);
  });

  test("In-app on a site that refuses framing falls back to the QR code", async ({ page }) => {
    await openWidget(page, "mealie", "medium", { kiosk: "pi-panel" });
    await choose(page, "In-app");
    await tapItem(page);
    await embed(page).getByRole("button", { name: "Show QR code" }).click();
    await expect(qr(page)).toBeVisible();
    // The site already refused: nowhere left to open it on a kiosk.
    await expect(page.getByRole("button", { name: "Open here" })).toHaveCount(0);
  });

  test("Off makes items inert", async ({ page }) => {
    await openWidget(page, "mealie", "medium", { kiosk: "pi-panel" });
    await choose(page, "Off");
    await expect(page.locator(".card-grid__item--clickable")).toHaveCount(0);
    await tapItem(page);
    await expect(qr(page)).toHaveCount(0);
    await expect(embed(page)).toHaveCount(0);
  });
});

test.describe("design review: nothing hugs the top of a tall surface", () => {
  test("Mealie rows spread inside tall cards and line up across days", async ({ page }) => {
    await openWidget(page, "mealie", "large");
    const rows = await page.locator(".card-grid__card").evaluateAll(cards =>
      cards.map(card => {
        const items = [...card.querySelectorAll(".card-grid__item")].map(el =>
          el.getBoundingClientRect()
        );
        const box = card.getBoundingClientRect();
        return {
          top: items[0].top - box.top,
          bottom: box.bottom - items.at(-1).bottom,
          tops: items.map(r => Math.round(r.top - box.top)),
        };
      })
    );
    for (const row of rows) {
      // The last row reaches the foot of the card, not mid-way down it.
      expect(row.bottom, "last meal row reaches the card foot").toBeLessThan(60);
    }
    // Breakfast / Lunch rows share one baseline across days (Dinner may wrap).
    expect(new Set(rows.map(r => r.tops[0])).size).toBe(1);
    expect(new Set(rows.map(r => r.tops[1])).size).toBe(1);
  });

  test("Yr at large: facts sit directly above the forecast, hero takes the spare height", async ({
    page,
  }) => {
    await openWidget(page, "yr", "large");
    const g = await page.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      return {
        details: r(".weather-forecast-renderer__details"),
        forecast: r(".weather-forecast-renderer__forecast"),
        main: r(".weather-forecast-renderer__main"),
      };
    });
    expect(g.forecast.top - g.details.bottom, "gap between facts and forecast").toBeLessThan(60);
    expect(g.main.height, "hero is the tall part").toBeGreaterThan(300);
  });

  test("Yr at 800x480 shows the forecast without scrolling", async ({ page }) => {
    await openWidget(page, "yr", "small");
    const g = await page.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      return {
        body: r(".dashboard-panel__body"),
        item: r(".weather-forecast-renderer__item"),
        temp: r(".weather-forecast-renderer__temp"),
      };
    });
    expect(g.item.top).toBeGreaterThanOrEqual(g.body.top);
    expect(g.item.bottom, "forecast tile fully visible").toBeLessThanOrEqual(g.body.bottom + 1);
    expect(g.temp.bottom, "temperature visible").toBeLessThan(g.item.top);
  });

  test("card labels stay readable at the smallest Card size", async ({ page }) => {
    await openWidget(page, "mealie", "medium", { view: { cardSize: "xsmall" } });
    const sizes = await page.evaluate(() =>
      [".card-grid__title", ".card-grid__item-label"].map(sel =>
        parseFloat(getComputedStyle(document.querySelector(sel)).fontSize)
      )
    );
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(9.9);
  });
});

test.describe("keyboard-only devices: the fit clamp releases when the region grows", () => {
  for (const key of ["mealie", "sl", "yr"]) {
    test(`${WIDGETS[key].label} refills a region that grows`, async ({ page }) => {
      const hits = { data: 0 };
      const widget = widgetOverrides(key, hits);
      widget.config.touchControls = "off";
      await page.setViewportSize({ width: 1000, height: 800 });
      await installApiMock(page, { config: widget.config, overrides: widget.overrides });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expect(page.locator(WIDGETS[key].unit).first()).toBeVisible();
      await page.waitForTimeout(300);
      // The region grows (a flow header hiding, a rotated screen, a bigger window).
      await page.setViewportSize({ width: 1600, height: 1300 });
      await page.waitForTimeout(700);
      const m = await measure(page, WIDGETS[key].unit);
      const bottom = Math.max(...m.units.map(u => Math.min(u.bottom, m.body.bottom)));
      expect(bottom, "content reaches the grown region's bottom").toBeGreaterThanOrEqual(
        m.body.bottom - 40
      );
      const right = Math.max(...m.units.map(u => Math.min(u.right, m.body.right)));
      expect(right, "content reaches the grown region's right edge").toBeGreaterThanOrEqual(
        m.body.right - 40
      );
    });
  }
});

test("Yr with no current conditions still fills its region", async ({ page }) => {
  const hits = { data: 0 };
  const widget = widgetOverrides("yr", hits);
  const base = WIDGETS.yr.data;
  const original = widget.overrides.find(([re]) => re.test("/api/plugins/inst-yr/data"));
  original[1] = (route, ctx) => {
    hits.data += 1;
    const body = base();
    delete body.current;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };
  await page.setViewportSize(SIZES.large);
  await installApiMock(page, { config: widget.config, overrides: widget.overrides });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".weather-forecast-renderer__item").first()).toBeVisible();
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const r = sel => document.querySelector(sel).getBoundingClientRect();
    return { body: r(".dashboard-panel__body"), item: r(".weather-forecast-renderer__item") };
  });
  const centre = (g.item.top + g.item.bottom) / 2;
  const bodyCentre = (g.body.top + g.body.bottom) / 2;
  expect(Math.abs(centre - bodyCentre), "forecast sits mid-region, not at the top").toBeLessThan(
    g.body.height * 0.2
  );
});
