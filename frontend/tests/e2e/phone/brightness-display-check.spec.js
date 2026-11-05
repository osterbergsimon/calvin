/**
 * calvin-29ws — the brightness ramp settings and the display check, driven
 * through the real UI against the API mock. The test plays the display agent
 * (`api.agentReport`); nothing reaches a real Calvin server or a screen.
 *
 * Runs at the phone size (390x844) and the 800x480 kiosk size. Set
 * BRIGHTNESS_SHOTS=<dir> to write the review screenshots.
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { KIOSK, gotoSettings, expectSettingsReady } from "./fixtures/navigation.js";

const SHOTS = process.env.BRIGHTNESS_SHOTS || "";
// What GET /kiosks carries for a screen nobody has checked: every field present.
const NEVER = {
  checkedAt: null,
  ddc: null,
  writes: null,
  model: null,
  connector: null,
  vcpVersion: null,
  limit: null,
};
const FOUND = { ddc: true, writes: true, checkedAt: "2026-11-04T10:00:00Z" };

const SIZES = [
  ["phone", null],
  ["kiosk", KIOSK],
];

async function shot(page, size, name) {
  if (!SHOTS) return;
  // Let the dialog's fade-in finish: a mid-fade frame shows the page through it.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    )
  );
  if (name !== "settings-section") {
    await page.screenshot({ path: path.join(SHOTS, `${size}-${name}.png`) });
    return;
  }
  // The section is taller than a kiosk screen: shoot it on a tall viewport.
  const original = page.viewportSize();
  await page.setViewportSize({ width: original.width, height: 1700 });
  await page.locator("#section-screen-power").scrollIntoViewIfNeeded();
  await page
    .locator("#section-screen-power")
    .screenshot({ path: path.join(SHOTS, `${size}-${name}.png`) });
  await page.setViewportSize(original);
}

async function openHallway(page, { kiosk = null } = {}) {
  await gotoSettings(page, "Screens", { kiosk });
  await expectSettingsReady(page);
  await page.locator('[data-test="screen-card"]', { hasText: "Hallway" }).first().click();
  await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
  const group = page.locator('[data-test="brightness-group"]');
  await group.scrollIntoViewIfNeeded();
  return group;
}

const dialog = page => page.getByRole("dialog", { name: "Check the hallway-pi display" });
const body = page => dialog(page).locator('[data-test="check-step-body"]');

for (const [size, viewport] of SIZES) {
  test.describe(`brightness — ${size}`, () => {
    if (viewport) test.use({ viewport, hasTouch: true, isMobile: false });

    test("the Brightness section turns the ramp on, reads in menu numbers and saves on release", async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      api.overridesByKiosk.hallway = {
        brightnessLimit: 26,
        brightnessConversion: [
          { ddc: 5, menu: 28 },
          { ddc: 19, menu: 61 },
        ],
      };
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await expect(group).toBeVisible();
      await expect(group.locator('[data-test="check-summary"]')).toContainText(
        "menu match from 2 readings · limit 26 (4 Nov)"
      );

      await group.getByRole("switch", { name: "Ramp brightness at sleep and wake" }).click();
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessRampEnabled).toBe(true);
      expect(api.overridesByKiosk.hallway.brightness).toBe(20);

      const slider = group.locator('[data-test="brightness-slider"]');
      await expect(slider).toBeVisible();
      await expect(group.locator('[data-test="brightness-value"]')).toContainText(
        "on the screen's menu"
      );
      await expect(group.locator('[data-test="limit-hatch"]')).toBeVisible();
      await expect(group.locator('[data-test="limit-note"]')).toContainText(
        "You can go up to 68 on the screen's menu (Calvin 22)"
      );

      // One save on release, not one per drag step.
      const before = api.overridesRequests.length;
      await slider.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await expect.poll(() => api.overridesByKiosk.hallway?.brightness).toBeLessThan(20);
      expect(api.overridesRequests.length - before).toBeLessThanOrEqual(2);
      await expect(group.locator('[data-test="brightness-note"]')).toContainText("Changing…");

      // The required note and the Dim-only trade-off are on the page.
      await expect(group.locator('[data-test="sleep-mode"]')).toContainText("backlight 0");

      await expectPhoneLayout(page, `Brightness section (${size})`);
      await shot(page, size, "settings-section");
      expect(consoleErrors).toEqual([]);
      expect(api.unmatched).toEqual([]);
    });

    test("an unchecked screen explains itself and offers the check", async ({ page }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: NEVER } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await expect(group.locator('[data-test="availability-text"]')).toContainText(
        "Calvin checks the display first"
      );
      await expect(group.locator('[data-test="check-summary"]')).toHaveText("Not checked yet");
      await shot(page, size, "not-checked");
      expect(api.unmatched).toEqual([]);
    });

    test("a full display check: detect, change, menu match, limit, save", async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: NEVER } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.getByRole("switch", { name: "Ramp brightness at sleep and wake" }).click();
      await expect(dialog(page)).toBeVisible();
      await expect(body(page)).toContainText("Asking hallway-pi's screen…");

      // Step 1: the agent finds the display, then Calvin dims it and asks.
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", {
        status: "done",
        detail: "NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1",
        info: { model: "NOMAD TOUCH" },
      });
      await expect(body(page)).toContainText("Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1", {
        timeout: 8000,
      });
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("write");
      api.agentReport("hallway", { status: "running", level: 9 });
      api.agentReport("hallway", { status: "done", level: 20 });
      await expect(body(page)).toContainText("Did hallway-pi get dimmer for a moment", {
        timeout: 8000,
      });
      await shot(page, size, "check-does-it-change");
      await page.getByRole("button", { name: "Yes, it changed" }).click();

      // The ramp starts once step 2 passes.
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessRampEnabled).toBe(true);

      // Step 3: two readings.
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("conversion");
      api.agentReport("hallway", { status: "done", level: 5 });
      await expect(body(page)).toContainText("Calvin set hallway-pi to 5", { timeout: 8000 });
      await page.locator('[data-test="reading-input"]').fill("28");
      await page.getByRole("button", { name: "Save reading" }).click();
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessConversion?.length).toBe(1);
      await page.getByRole("button", { name: "Add a reading" }).click();
      await expect.poll(() => api.displayCheckRuns.hallway?.value).toBe(10);
      api.agentReport("hallway", { status: "done", level: 10 });
      await page.locator('[data-test="reading-input"]').fill("40");
      await page.getByRole("button", { name: "Save reading" }).click();
      await expect(body(page).locator('[data-test="check-fit"]')).toContainText("menu ≈");
      await shot(page, size, "check-menu-match");
      await page.getByRole("button", { name: "Next", exact: true }).click();

      // Step 4: the warning, then a running test with a live log.
      await expect(body(page)).toContainText("it may restart");
      await page.getByRole("button", { name: "Start the test" }).click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("limit");
      api.agentReport("hallway", {
        level: 28,
        log: [
          { at: "x", level: 24, note: "fine" },
          { at: "x", level: 28, note: "touch controller reset" },
        ],
      });
      await expect(body(page).locator('[data-test="limit-log"]')).toContainText(
        "28 · touch controller reset",
        { timeout: 8000 }
      );
      await expect(page.getByRole("button", { name: "Stop now" })).toBeVisible();
      await shot(page, size, "check-running");

      api.agentReport("hallway", {
        status: "done",
        level: 20,
        limit: 26,
        detail: "limit found: 26",
      });
      await expect(body(page).locator('[data-test="check-finish"]')).toContainText(
        "Limit found: 26",
        { timeout: 8000 }
      );
      // A found limit is applied by itself: the owner never has to press Save.
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessLimit).toBe(26);
      expect(api.displayCheckCalls.filter(call => call === "POST save-limit")).toHaveLength(1);
      await expect(body(page).locator('[data-test="limit-saved"]')).toBeVisible();
      await shot(page, size, "check-finished");
      await page.locator('[data-test="check-done"]').click();
      await expect(dialog(page)).toBeHidden();
      await expect(group.locator('[data-test="limit-note"]')).toContainText("limit");
      expect(consoleErrors).toEqual([]);
      expect(api.unmatched).toEqual([]);
    });

    test("Stop now ends a running limit test, and closing the dialog stops the run", async ({
      page,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="limit-link"], [data-test="check-open"]').first().click();
      await expect(dialog(page)).toBeVisible();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      // Closing the dialog asks the agent to stop.
      await dialog(page).getByRole("button", { name: "Close the display check" }).click();
      await expect(dialog(page)).toBeHidden();
      await expect.poll(() => api.displayCheckCalls.includes("POST stop")).toBe(true);
    });

    test("the agent refusing because the screen sleeps shows the asleep state", async ({
      page,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", { status: "asleep" });
      await expect(dialog(page).locator('[data-test="check-asleep"]')).toContainText(
        "Turn it on now to check it",
        { timeout: 8000 }
      );
      await shot(page, size, "check-asleep");
    });

    test("a screen that sleeps by its schedule is refused up front", async ({ page }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      api.overridesByKiosk.hallway = {
        screenNow: { power: "off", setAt: new Date().toISOString() },
      };
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect(dialog(page).locator('[data-test="check-asleep"]')).toContainText(
        "hallway-pi is asleep. Turn it on now to check it."
      );
      expect(api.displayCheckCalls).not.toContain("POST start");

      // The sheet keeps a side gutter, even when it is full screen on a phone.
      const box = await dialog(page).locator('[data-test="check-asleep"]').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(16);
      const strip = await dialog(page).locator(".dcheck__strip").boundingBox();
      expect(strip.x).toBeGreaterThanOrEqual(16);

      // Turn on now is the normal Screen now action; the check starts once awake.
      await dialog(page).locator('[data-test="check-turn-on"]').click();
      await expect.poll(() => api.overridesByKiosk.hallway?.screenNow?.power).toBe("on");
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
    });

    test("a second device sees the running check read-only, with Stop", async ({ page }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      api.displayCheckBusy = {
        id: "elsewhere",
        step: "limit",
        status: "running",
        active: true,
        level: 22,
        log: [{ at: "x", level: 22, note: "fine" }],
        requestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect(dialog(page)).toContainText("A check is running from another device");
      await expect(dialog(page).getByRole("button", { name: "Stop the check" })).toBeVisible();
      expect(api.displayCheckCalls).not.toContain("POST start");
    });
  });
}

test.describe("brightness — on the panel itself", () => {
  test.use({ viewport: KIOSK, hasTouch: true, isMobile: false });

  test("the limit test is not offered on the screen being checked", async ({ page }) => {
    const api = await installApiMock(page, {
      kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
    });
    api.overridesByKiosk.hallway = { brightnessRampEnabled: true };
    const group = await openHallway(page, { kiosk: "hallway" });
    await group.locator('[data-test="limit-link"]').click();
    await expect(dialog(page).locator('[data-test="limit-on-panel"]')).toContainText(
      "You're on hallway-pi itself. Run this step from your phone or computer"
    );
    await expect(page.getByRole("button", { name: "Start the test" })).toHaveCount(0);
    await shot(page, "kiosk", "check-on-panel");
    expect(api.unmatched).toEqual([]);
  });
});
