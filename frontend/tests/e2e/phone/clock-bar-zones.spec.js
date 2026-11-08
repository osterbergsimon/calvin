/**
 * Clock bar zones never overlap (calvin-r7lb).
 *
 * With several wide plugin tiles on the bar, the Centre zone (time and date)
 * and the Right zone (tiles, status) drew on top of each other. This spec
 * measures the real boxes, in the editor preview and on the live bar, for the
 * top/bottom bar and the side bar, in landscape and portrait, at narrow and
 * normal widths. Nothing here reaches a real server: every route is mocked.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import {
  gotoDashboard,
  gotoSettings,
  expectSettingsReady,
  selectCategory,
} from "./fixtures/navigation.js";

const row = (label, value, unit) => ({ label, value, ...(unit ? { unit } : {}) });

// Plugin tiles with long names and values, like the owner's bar.
const ALL_TILES = [
  { id: "sl", name: "SL departures", items: [row("Tappström", "176·5' · 176·9'")] },
  { id: "yr", name: "Yr weather", items: [row("Yr", "2", "°")] },
  {
    id: "trafik",
    name: "Traffic",
    items: [row("Stockholms central", "Pendeltåg 41 · 3 min"), row("Slussen", "Buss 53 · 7 min")],
  },
  {
    id: "energy",
    name: "Energy",
    items: [row("Elpris just nu", "148,2 öre/kWh"), row("Solceller idag", "12,4 kWh")],
  },
];

const tilePlugin = tile => ({
  id: tile.id,
  name: tile.name,
  type: "service",
  version: "1.0.0",
  enabled: true,
  description: tile.name,
  instance_config_schema: { display_order: { type: "integer", default: 0, hidden: true } },
  display_schema: null,
  statusbar_schema: {
    kind: "status",
    layout: "row",
    data_path: "items",
    item: { label_path: "label", value_path: "value", unit_path: "unit" },
  },
});

const tileOverrides = (TILES = ALL_TILES) => [
  [
    /^\/api\/plugins$/,
    async (route, { url }) => {
      if (url.searchParams.get("plugin_type") !== "service") return false;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ plugins: TILES.map(tilePlugin) }),
      });
    },
  ],
  ...TILES.flatMap(tile => [
    [
      new RegExp(`^/api/plugins/${tile.id}$`),
      route =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(tilePlugin(tile)) }),
    ],
    [
      new RegExp(`^/api/plugins/${tile.id}/instances$`),
      route =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            instances: [
              {
                id: tile.id,
                plugin_id: tile.id,
                name: tile.name,
                enabled: true,
                running: true,
                display_order: 0,
                config: {},
              },
            ],
          }),
        }),
    ],
    [
      new RegExp(`^/api/plugins/${tile.id}/data$`),
      route =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ items: tile.items }),
        }),
    ],
  ]),
];

const intersects = (a, b) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

/**
 * Measure one bar: the zone boxes, each zone's chips and every leaf that
 * draws text. Returns the offending pairs, so a failure names what collided.
 */
const measure = (page, barSelector) =>
  page.evaluate(selector => {
    const bar = document.querySelector(selector);
    const rectOf = el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const name = el =>
      el.dataset.partId ||
      el.dataset.dropZone ||
      el.className?.toString().split(" ")[0] ||
      el.tagName;
    const zones = [...bar.querySelectorAll("[data-drop-zone]")].map(zone => {
      const editable = zone.querySelector("[data-part-id]");
      const chips = editable ? [...zone.querySelectorAll("[data-part-id]")] : [...zone.children];
      // The text-bearing leaves of the zone: they draw where the eye reads.
      const leaves = [...zone.querySelectorAll("*")].filter(
        el =>
          [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
          getComputedStyle(el).visibility !== "hidden"
      );
      return {
        key: zone.dataset.dropZone,
        box: rectOf(zone),
        chips: chips.map(el => ({ name: name(el), box: rectOf(el) })),
        // What is actually painted: a leaf clipped by an overflow:hidden
        // ancestor (a squeezed tile) draws only the part inside it.
        leaves: leaves
          .map(el => {
            const box = rectOf(el);
            for (let a = el.parentElement; a && a !== zone.parentElement; a = a.parentElement) {
              if (getComputedStyle(a).overflow === "visible") continue;
              const c = rectOf(a);
              box.left = Math.max(box.left, c.left);
              box.right = Math.min(box.right, c.right);
              box.top = Math.max(box.top, c.top);
              box.bottom = Math.min(box.bottom, c.bottom);
            }
            return { name: `${name(el)}:${el.textContent.trim()}`, box };
          })
          .filter(leaf => leaf.box.right - leaf.box.left >= 1),
      };
    });
    return { bar: rectOf(bar), zones, scrollOverflow: bar.scrollWidth - bar.clientWidth };
  }, barSelector);

const collisions = measured => {
  const found = [];
  const { zones } = measured;
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i];
      const b = zones[j];
      if (intersects(a.box, b.box)) found.push(`zone ${a.key} x zone ${b.key}`);
      for (const ca of [...a.chips, ...a.leaves]) {
        for (const cb of [...b.chips, ...b.leaves]) {
          if (intersects(ca.box, cb.box)) found.push(`${a.key}/${ca.name} x ${b.key}/${cb.name}`);
        }
      }
    }
  }
  // Nothing may draw outside the bar's own box (the bar clips or grows).
  for (const zone of zones) {
    for (const leaf of zone.leaves) {
      // A tile squeezed to nothing is clipped and draws nothing.
      const drawn = leaf.box.right - leaf.box.left >= 1;
      const outside =
        drawn &&
        (leaf.box.left < measured.bar.left - 0.5 ||
          leaf.box.right > measured.bar.right + 0.5 ||
          leaf.box.top < measured.bar.top - 0.5 ||
          leaf.box.bottom > measured.bar.bottom + 0.5);
      if (outside) found.push(`${zone.key}/${leaf.name} outside the bar`);
    }
  }
  return found;
};

// The time keeps its full text: it is never the part that gives way.
const timeIsWhole = page =>
  page.evaluate(() => {
    const time = document.querySelector(".clock-time");
    return time ? time.scrollWidth <= time.clientWidth + 1 : true;
  });

// The owner's own bar (SL and Yr) and a crowded one with several wide tiles.
const SCENARIOS = [
  { name: "owner", tiles: ALL_TILES.slice(0, 2) },
  { name: "crowded", tiles: ALL_TILES },
];

const shot = name => `${process.env.ZONES_SHOTS || "test-results/clock-bar-zones"}/${name}.png`;

const SHAPES = [
  { shape: "horizontal", bar: ".clock-bar-horizontal", label: "top/bottom" },
  { shape: "vertical", bar: ".clock-bar-vertical", label: "side" },
];

const openEditor = async (page, { shape, orientation }) => {
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Dashboard");
  await page.locator('[data-test="edit-clock-bar"]').click();
  const editor = page.locator(".cbe-root");
  await expect(editor).toBeVisible();
  if (shape === "vertical") await editor.getByRole("radio", { name: "Side bar" }).click();
  if (orientation === "portrait") {
    const portrait = editor.getByRole("radio", { name: "Portrait" });
    if (await portrait.count()) await portrait.click();
  }
  // Every tile has to be on the bar and loaded before measuring.
  await expect(editor.locator(".plugin-statusbar-items .status--row").first()).toBeAttached();
  await page.waitForTimeout(400);
  return editor;
};

const WIDTHS = [
  { name: "narrow", width: 390, height: 844 },
  { name: "kiosk-portrait", width: 480, height: 800 },
  { name: "normal", width: 1280, height: 800 },
];

for (const scenario of SCENARIOS) {
  for (const size of WIDTHS) {
    test.describe(`clock bar zones, ${scenario.name} tiles, ${size.name} width (${size.width}px)`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      for (const { shape, bar, label } of SHAPES) {
        for (const orientation of ["landscape", "portrait"]) {
          test(`editor preview: ${label} bar, ${orientation}`, async ({ page }) => {
            const api = await installApiMock(page, { overrides: tileOverrides(scenario.tiles) });
            const editor = await openEditor(page, { shape, orientation });
            await page.locator(`.cbe-root ${bar}`).screenshot({
              path: shot(`editor-${scenario.name}-${shape}-${orientation}-${size.name}`),
            });
            const measured = await measure(page, `.cbe-root ${bar}`);
            expect(collisions(measured)).toEqual([]);
            expect(await timeIsWhole(page)).toBe(true);
            await expect(editor).toBeVisible();
            expect(api.hostActions).toEqual([]);
          });
        }

        test(`live bar: ${label} bar`, async ({ page }) => {
          const api = await installApiMock(page, {
            overrides: tileOverrides(scenario.tiles),
            config: {
              clockBarMode: shape,
              clockBarPosition: shape === "vertical" ? "left" : "top",
              clockBarShowInKiosk: true,
            },
          });
          await gotoDashboard(page);
          await expect(page.locator(bar).first()).toBeVisible();
          await expect(page.locator(".plugin-statusbar-items .status--row").first()).toBeAttached();
          await page.waitForTimeout(400);
          await page
            .locator(bar)
            .first()
            .screenshot({ path: shot(`live-${scenario.name}-${shape}-${size.name}`) });
          const measured = await measure(page, bar);
          expect(collisions(measured)).toEqual([]);
          expect(await timeIsWhole(page)).toBe(true);
          expect(api.hostActions).toEqual([]);
        });
      }
    });
  }
}

// What gives way, in order (calvin-r7lb): every tile name goes before any tile
// value loses a character; the room name ends in an ellipsis; nothing, the
// menu included, is ever drawn past the screen edge.
const cutFlags = page =>
  page.evaluate(() => {
    const cells = [...document.querySelectorAll(".clock-bar-horizontal .status__cell")];
    const cut = el => el.scrollWidth > el.clientWidth + 1;
    const valueCut = cells
      .map(cell => cell.querySelector(".status__cell-value"))
      .filter(el => el && cut(el))
      .map(el => el.textContent.trim());
    const nameWhole = cells
      .map(cell => cell.querySelector(".status__cell-text"))
      .filter(el => el && el.clientWidth > 0 && !cut(el))
      .map(el => el.textContent.trim());
    const nameCut = cells
      .map(cell => cell.querySelector(".status__cell-text"))
      .filter(el => el && cut(el)).length;
    return { valueCut, nameWhole, nameCut };
  });

const pastScreenEdge = page =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const bad = [];
    const bar = document.querySelector(".clock-bar-horizontal");
    for (const el of bar.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const isMenu = el.classList.contains("bar-action-cluster");
      if (r.width < 1) continue;
      if ((text || isMenu) && r.right > width + 0.5) {
        bad.push(`${el.className || el.tagName} ends at ${Math.round(r.right)} of ${width}`);
      }
    }
    return bad;
  });

const CENTRE_TILES = {
  clockBarDesign: {
    horizontal: {
      zones: {
        left: ["logo", "room", "pageDots"],
        center: ["time", "date", "tiles"],
        right: ["status"],
      },
    },
  },
};

const openLive = async (page, { tiles, config = {}, kiosk = null, kioskExtras = null }) => {
  const api = await installApiMock(page, {
    overrides: tileOverrides(tiles),
    ...(kioskExtras ? { kioskExtras } : {}),
    config: {
      clockBarMode: "horizontal",
      clockBarPosition: "top",
      clockBarShowInKiosk: true,
      ...config,
    },
  });
  await page.goto(kiosk ? `/?kiosk=${kiosk}` : "/");
  await expect(page.locator(".clock-bar-horizontal").first()).toBeVisible();
  await expect(page.locator(".plugin-statusbar-items .status--row").first()).toBeAttached();
  await page.waitForTimeout(500);
  return api;
};

const expectOrderly = async page => {
  expect(collisions(await measure(page, ".clock-bar-horizontal"))).toEqual([]);
  expect(await pastScreenEdge(page)).toEqual([]);
  const { valueCut, nameWhole } = await cutFlags(page);
  // A value may only be cut once every name is already gone.
  if (valueCut.length) expect({ valueCut, nameWhole }).toEqual({ valueCut, nameWhole: [] });
};

test.describe("what gives way in a crowded live bar", () => {
  for (const [width, label] of [
    [1280, "four tiles in the Centre zone, 1280 px"],
    [390, "the owner's tiles in the Centre zone, 390 px"],
  ]) {
    test(`${label}: nothing is drawn past the screen, the menu included`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openLive(page, {
        tiles: width === 1280 ? ALL_TILES : ALL_TILES.slice(0, 2),
        config: CENTRE_TILES,
      });
      await expectOrderly(page);
    });
  }

  for (const [width, count] of [
    [590, 2],
    [1400, 4],
  ]) {
    test(`${count} tiles at ${width} px: every name goes before any value`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openLive(page, { tiles: ALL_TILES.slice(0, count) });
      await expectOrderly(page);
    });
  }

  test("a 75-character room name ends in an ellipsis at 800 px", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 480 });
    const room = "The long hall at the far end of the house past the garden gate and the old barn";
    await openLive(page, {
      tiles: ALL_TILES.slice(0, 2),
      kiosk: "hallway",
      kioskExtras: { hallway: { overrides: { displayName: room } } },
    });
    const roomCut = await page
      .locator(".clock-bar-horizontal .clock-bar-room")
      .evaluate(
        el =>
          el.scrollWidth > el.clientWidth + 1 ||
          el.children[0]?.scrollWidth > el.children[0]?.clientWidth + 1
      );
    expect(roomCut).toBe(true);
    await expectOrderly(page);
  });
});

// The departure time is what people read: where the owner's two tiles are
// squeezed, the name gives way and the SL value stays whole. (On the old code
// nothing was cut at all, so this fails there.)
test.describe("owner tiles keep their values whole", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("editor preview, top/bottom bar, landscape", async ({ page }) => {
    await installApiMock(page, { overrides: tileOverrides(ALL_TILES.slice(0, 2)) });
    const editor = await openEditor(page, { shape: "horizontal", orientation: "landscape" });
    const flags = await cutFlags(page);
    expect(flags.nameCut).toBeGreaterThan(0);
    expect(flags.valueCut).toEqual([]);
  });
});
