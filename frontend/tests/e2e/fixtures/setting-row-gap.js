/**
 * calvin-4txw — a Settings row whose control holds two controls leaves a gap
 * between them (SettingRow.vue, `--gap-inline` = 8px). These helpers open the
 * four rows that show it against the API mock and measure the pair, so nothing
 * reaches a real Calvin server or host.
 *
 * The four rows: Screen now (Screens › a screen › Power), the server's own
 * display (System › Restart), Install updates (System › Updates) and the
 * brightness ramp (Screens › a screen › Power › Brightness).
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings, openSection } from "../phone/fixtures/navigation.js";

/** The gap SettingRow.vue promises between two controls (--gap-inline). */
export const ROW_GAP_PX = 8;

// A screen whose display answers nothing: the ramp row then shows its "Check
// again" button beside the toggle, the two-control case calvin-4txw is about.
const NOT_DDC = {
  checkedAt: "2026-11-04T10:00:00Z",
  ddc: false,
  writes: null,
  model: "Studio Display",
  connector: "HDMI",
  vcpVersion: null,
  limit: null,
};

export const GAP_ROWS = {
  screenNow: page => page.locator('.setting-row:has([data-test="screen-now-on"])'),
  brightnessRamp: page => page.locator('.setting-row:has([data-test="ramp-toggle"])'),
  serverDisplay: page => page.locator('[data-test="server-display-row"]'),
  installUpdates: page => page.locator('.setting-row:has-text("Install updates")'),
};

/** Mocked app, with the screen set to Schedule so "Screen now" is shown. */
export async function openGapApp(page, { themeMode = "light" } = {}) {
  const api = await installApiMock(page, {
    config: {
      themeMode,
      screenPower: "schedule",
      displayScheduleEnabled: true,
    },
    kioskExtras: { hallway: { displayStack: "cog", displayCheck: NOT_DDC } },
  });
  api.overridesByKiosk.hallway = { brightnessRampEnabled: true, brightness: 20 };
  return api;
}

/** Settings › Screens › Hallway › Power, where two of the four rows live. */
export async function openScreenPower(page, { kiosk = null } = {}) {
  await gotoSettings(page, "Screens", { kiosk });
  await expectSettingsReady(page);
  await page.locator('[data-test="screen-card"]', { hasText: "Hallway" }).first().click();
  await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
  await openSection(page, "screen-power");
  const section = page.locator("#section-screen-power");
  await expect(section).toBeVisible();
  return section;
}

/** Settings › System, opened on the section a row lives in. */
export async function openSystemSection(page, sectionId, { kiosk = null } = {}) {
  await gotoSettings(page, "System", { kiosk });
  await expectSettingsReady(page);
  await openSection(page, sectionId);
  const section = page.locator(`#section-${sectionId}`);
  await expect(section).toBeVisible();
  return section;
}

/**
 * The clear space between two boxes, along the axis they share. A pair that
 * wrapped on a phone is measured top/bottom; a pair side by side left/right.
 */
export function pairGap(first, second) {
  if (!first || !second) return null;
  const overlapX = first.x < second.x + second.width && second.x < first.x + first.width;
  const overlapY = first.y < second.y + second.height && second.y < first.y + first.height;
  if (overlapY) {
    const [left, right] = first.x <= second.x ? [first, second] : [second, first];
    return { axis: "row", gap: right.x - (left.x + left.width) };
  }
  if (overlapX) {
    const [top, bottom] = first.y <= second.y ? [first, second] : [second, first];
    return { axis: "column", gap: bottom.y - (top.y + top.height) };
  }
  return { axis: "diagonal", gap: 0 };
}

/** Both boxes of a control pair, from the row that holds them. */
export async function measurePair(row, firstTest, secondTest) {
  const first = await row.locator(`[data-test="${firstTest}"]`).boundingBox();
  const second = await row.locator(`[data-test="${secondTest}"]`).boundingBox();
  return { first, second, ...pairGap(first, second) };
}

/** The gap rule, with the measured boxes in the failure message. */
export function expectPairGap(pair, label) {
  const detail = `first ${JSON.stringify(pair.first)} second ${JSON.stringify(pair.second)}`;
  expect(pair.first, `${label}: the first control is not on screen (${detail})`).not.toBeNull();
  expect(pair.second, `${label}: the second control is not on screen (${detail})`).not.toBeNull();
  expect(
    pair.axis,
    `${label}: the two controls overlap or cross on both axes (${detail})`
  ).not.toBe("diagonal");
  expect(
    pair.gap,
    `${label}: only ${pair.gap}px apart along ${pair.axis} (${detail})`
  ).toBeGreaterThanOrEqual(ROW_GAP_PX - 0.5);
}

const SHOTS = process.env.ROW_GAP_SHOTS || "";
const STATE = process.env.ROW_GAP_STATE || "after";

/**
 * Write the review screenshot of one row. Off unless ROW_GAP_SHOTS names a
 * directory; ROW_GAP_STATE prefixes the name with before or after.
 */
export async function shotRow(page, row, { size, theme, name }) {
  if (!SHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))
    )
  );
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({ path: path.join(SHOTS, `${STATE}-${size}-${theme}-${name}.png`) });
}

/**
 * Drive the four rows and check the two pairs. `size` and `theme` only name
 * the screenshots; the caller sets the viewport.
 */
export async function checkRowGaps(page, { size, theme, kiosk = null, shootAll = true }) {
  const api = await openGapApp(page, { themeMode: theme === "backlit" ? "dark" : "light" });

  await openScreenPower(page, { kiosk });
  const screenNow = GAP_ROWS.screenNow(page);
  await expect(screenNow).toBeVisible();
  const screenPair = await measurePair(screenNow, "screen-now-on", "screen-now-off");
  if (shootAll) await shotRow(page, screenNow, { size, theme, name: "screen-now" });

  const ramp = GAP_ROWS.brightnessRamp(page);
  await expect(ramp).toBeVisible();
  await expect(ramp.locator('[data-test="availability-action"]')).toBeVisible();
  if (shootAll) await shotRow(page, ramp, { size, theme, name: "brightness-ramp" });

  await openSystemSection(page, "maintenance-updates", { kiosk });
  const installUpdates = GAP_ROWS.installUpdates(page);
  await expect(installUpdates).toBeVisible();
  if (shootAll) await shotRow(page, installUpdates, { size, theme, name: "install-updates" });

  await openSystemSection(page, "maintenance-system", { kiosk });
  const serverDisplay = GAP_ROWS.serverDisplay(page);
  await expect(serverDisplay).toBeVisible();
  const serverPair = await measurePair(serverDisplay, "server-display-off", "server-display-on");
  if (shootAll) await shotRow(page, serverDisplay, { size, theme, name: "server-display" });

  // Assert last, so a regression still writes every review screenshot above.
  expectPairGap(screenPair, `${size} ${theme} Screen now`);
  expectPairGap(serverPair, `${size} ${theme} server display`);

  return { api, screenPair, serverPair };
}
