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
        "on the panel's own menu"
      );
      await expect(group.locator('[data-test="limit-hatch"]')).toBeVisible();
      await expect(group.locator('[data-test="limit-note"]')).toContainText(
        "You can go up to 68 on the panel's own menu (Calvin 22)"
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

    test("a full display check: detect, three panel-set levels, save", async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: NEVER } },
      });
      api.overridesByKiosk.hallway = { brightnessConversion: [{ ddc: 5, menu: 28 }] };
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.getByRole("switch", { name: "Ramp brightness at sleep and wake" }).click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText(
        "Waiting for the screen to pick up the check. It checks in about once a minute."
      );

      // The screen picks the check up: the power watch starts, without its name.
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", {});
      await expect(dialog(page)).toContainText("Checking the power before changing anything", {
        timeout: 8000,
      });

      // Then step 1: the agent finds the display.
      api.agentReport("hallway", {
        preflight: { status: "clean", faults: [] },
        start: { level: 20, known: true, source: "read" },
      });
      api.agentStep("hallway", "detect", {
        detail: "NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1",
        info: { model: "NOMAD TOUCH" },
      });
      await expect(body(page)).toContainText("Found NOMAD TOUCH · DDC/CI 2.1 · HDMI-A-1", {
        timeout: 8000,
      });
      await expect(body(page)).toContainText("Calvin won't change the brightness");
      await shot(page, size, "check-found");
      await page.getByRole("button", { name: "Next", exact: true }).click();

      // Steps 2-4: the person sets the panel, Calvin only reads.
      const levels = [
        [60, 20, "Highest level"],
        [40, 12, "Everyday level"],
        [10, 2, "Lowest level"],
      ];
      for (const [i, [typed, ddc, heading]] of levels.entries()) {
        await expect(body(page)).toContainText(heading);
        await expect(body(page)).toContainText("the panel's own menu");
        if (i === 0) {
          await expect(body(page)).toContainText(
            "Calvin starts the screen at the minimum and brings it up to this after it turns on."
          );
          await shot(page, size, "check-highest");
        }
        await page.locator('[data-test="reading-input"]').fill(String(typed));
        await page.getByRole("button", { name: "Read it", exact: true }).click();
        await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("read");
        api.agentStep("hallway", "read", { level: ddc, lastWrite: null });
        await expect(body(page).locator('[data-test="level-pair"]')).toHaveText(
          `Panel ${typed} · Calvin ${ddc}`,
          { timeout: 8000 }
        );
        if (i === 0) await shot(page, size, "check-read");
        await page
          .getByRole("button", { name: i === 2 ? "See the summary" : "Next", exact: true })
          .click();
      }

      // The summary: nothing is saved until Save.
      const summary = body(page).locator('[data-test="check-summary"]');
      await expect(summary).toContainText("Panel 60 · Calvin 20");
      await expect(summary).toContainText("Panel 10 · Calvin 2");
      expect(api.overridesByKiosk.hallway?.brightnessLimit).toBeUndefined();
      const done = await page.locator('[data-test="check-save"]').boundingBox();
      const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      expect(view.w).toBe(viewport ? viewport.width : 390);
      expect(done.x + done.width).toBeLessThanOrEqual(view.w - 19);
      if (!viewport) expect(done.y + done.height).toBeLessThanOrEqual(view.h - 8);
      await shot(page, size, "check-summary");
      await expectPhoneLayout(page, `check summary (${size})`);

      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessLimit).toBe(20);
      expect(api.overridesByKiosk.hallway).toMatchObject({
        brightnessFloor: 2,
        brightness: 12,
        brightnessConversion: [
          { ddc: 2, menu: 10 },
          { ddc: 12, menu: 40 },
          { ddc: 20, menu: 60 },
        ],
      });
      // One session the whole way: a single start, then step changes; Done ends it.
      expect(api.displayCheckCalls.filter(call => call === "POST start")).toHaveLength(1);
      await page.locator('[data-test="check-done"]').click();
      await expect(dialog(page)).toBeHidden();
      await expect.poll(() => api.displayCheckCalls.includes("POST stop")).toBe(true);
      await expect(group.locator('[data-test="floor-note"]')).toContainText(
        /Lowest: Panel \d+ \(Calvin 2\)/
      );

      // Clear calibration wipes the three keys together.
      await group.locator('[data-test="calibration-clear"]').click();
      await expect.poll(() => api.overridesByKiosk.hallway?.brightnessLimit).toBeUndefined();
      expect(api.overridesByKiosk.hallway?.brightnessFloor).toBeUndefined();
      expect(api.overridesByKiosk.hallway?.brightnessConversion).toBeUndefined();
      expect(consoleErrors).toEqual([]);
      expect(api.unmatched).toEqual([]);
    });

    test("power trouble before the check starts refuses it and points to the fix", async ({
      page,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", {
        preflight: { status: "fault", faults: [{ kind: "under-voltage" }] },
        status: "error",
        reason: "power_at_idle",
      });
      await expect(dialog(page)).toContainText("hallway-pi has power trouble already", {
        timeout: 8000,
      });
      await expect(dialog(page).locator('[data-test="check-status"]')).toContainText(
        "Check not started · power trouble at idle"
      );
      await expect(dialog(page).getByRole("link", { name: "How to fix the power" })).toBeVisible();
      await shot(page, size, "check-power-idle");
      await expectPhoneLayout(page, `power trouble at idle (${size})`);
      expect(api.displayCheckCalls).not.toContain("POST step");
    });

    test("a fault at the highest level asks for the pre-drop level and moves on", async ({
      page,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", {
        preflight: { status: "clean", faults: [] },
        start: { level: 19, known: true, source: "read" },
      });
      api.agentStep("hallway", "detect", { detail: "NOMAD TOUCH" });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.locator('[data-test="reading-input"]').fill("60");
      await page.getByRole("button", { name: "Read it", exact: true }).click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("read");
      api.agentReport("hallway", {
        status: "error",
        reason: "power_trouble",
        fault: { step: "read", level: 20, kind: "under-voltage", at: "x", lastGood: 20 },
      });
      await expect(dialog(page).locator('[data-test="check-fault"]')).toContainText(
        "Power trouble at Calvin 20 · under-voltage",
        { timeout: 8000 }
      );
      await expect(body(page)).toContainText(
        /The power dropped at that level\. Calvin dimmed the screen\. Type the Brightness the panel's menu showed just before it dropped\./
      );
      await expect(dialog(page).getByRole("button", { name: "Use as highest" })).toBeVisible();
      await shot(page, size, "check-fault");
      await expectPhoneLayout(page, `fault in a step (${size})`);
      expect(api.overridesByKiosk.hallway?.brightnessLimit).toBeUndefined();
    });

    test("Stop shows it is stopping, and an unfinished run says what was kept", async ({
      page,
    }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      api.overridesByKiosk.hallway = { brightnessLimit: 26 };
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="check-open"]').click();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
      api.agentReport("hallway", { preflight: { status: "clean", faults: [] } });
      api.agentStep("hallway", "detect", { detail: "NOMAD TOUCH" });
      await dialog(page).getByRole("button", { name: "Stop the check" }).click();
      await expect(dialog(page).locator('[data-test="check-status"]')).toContainText(
        "Check stopped"
      );
      await expect(body(page)).toContainText(
        "Nothing changed; the previous calibration is still in place."
      );
      await expect(dialog(page).locator('[data-test="check-done"]')).toBeVisible();
      await expect(dialog(page).locator('[data-test="check-retry"]')).toHaveText("Try again");
      await shot(page, size, "check-stopped");
      expect(api.overridesByKiosk.hallway).toEqual({ brightnessLimit: 26 });
    });

    test("closing the dialog stops the run", async ({ page }) => {
      const api = await installApiMock(page, {
        kioskExtras: { hallway: { displayStack: "cog", displayCheck: FOUND } },
      });
      const group = await openHallway(page, { kiosk: viewport ? "workshop" : null });
      await group.locator('[data-test="limit-link"], [data-test="check-open"]').first().click();
      await expect(dialog(page)).toBeVisible();
      await expect.poll(() => api.displayCheckRuns.hallway?.step).toBe("detect");
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
        step: "read",
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
