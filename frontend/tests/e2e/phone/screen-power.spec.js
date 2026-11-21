/**
 * calvin-25g9 — the Screen power section in each mode, at phone width and on
 * the 800x480 wall panel, in light and Backlit (UI spec §7, §9).
 *
 * The three segments must stay on one line, the page must not scroll sideways,
 * and every mode must say its own hint. Set SCREEN_POWER_SHOTS=<dir> to write
 * the review screenshots (docs/design/mocks/screen-power/built/).
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { KIOSK, expectSettingsReady, gotoSettings, openSection } from "./fixtures/navigation.js";

const SHOTS = process.env.SCREEN_POWER_SHOTS || "";

const WEEK = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  day,
  enabled: true,
  onTime: "06:30",
  offTime: "22:00",
}));

const HINTS = {
  schedule: "Turns on and off at the times below.",
  always_on: "Never turns off on a schedule. Turn off when idle still applies.",
  external: "Homey, Home Assistant or a script with an API key turns it on and off.",
};

const MODES = ["schedule", "always_on", "external"];

const SIZES = [
  ["phone", null, { width: 390, height: 844 }],
  ["kiosk", KIOSK, { width: 800, height: 480 }],
];

const THEMES = [
  ["light", "light"],
  ["dark", "dark"],
];

function modeConfig(mode) {
  return {
    timezone: "Europe/Stockholm",
    screenPower: mode,
    displayScheduleEnabled: mode === "schedule",
    displaySchedule: WEEK,
  };
}

function commandFor(mode) {
  // Schedule follows its schedule in the shot: an "Until …" line with a made-up
  // boundary would contradict the schedule summary beside it. External shows a
  // named key's command, which has no until line.
  if (mode !== "external") return {};
  return {
    hallway: {
      power: "off",
      setAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      by: "automation",
      keyName: "Homey",
    },
  };
}

for (const [sizeName, kiosk, viewport] of SIZES) {
  for (const [themeName, themeMode] of THEMES) {
    test.describe(`screen power — ${sizeName} ${themeName}`, () => {
      test.use({ viewport, hasTouch: true, isMobile: sizeName === "phone" });

      for (const mode of MODES) {
        test(`${mode}: three segments, one line, no sideways scroll`, async ({
          page,
          consoleErrors,
        }) => {
          const api = await installApiMock(page, {
            config: { ...modeConfig(mode), themeMode },
            screenPower: commandFor(mode),
          });
          await gotoSettings(page, "Screens", { kiosk });
          await expectSettingsReady(page);
          await page.locator('[data-test="screen-card"]').first().click();
          await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
          await openSection(page, "screen-power");

          const section = page.locator("#section-screen-power");
          await expect(section).toBeVisible();
          await expect(page.locator('[data-test="screen-power-hint"]')).toHaveText(HINTS[mode]);

          const group = page.getByRole("radiogroup", { name: "Screen power" });
          await expect(group).toBeVisible();
          const segments = await group.locator("[role='radio']").evaluateAll(elements =>
            elements.map(element => {
              const box = element.getBoundingClientRect();
              return { label: element.textContent.trim(), top: box.top, height: box.height };
            })
          );
          expect(segments.map(segment => segment.label)).toEqual([
            "Schedule",
            "Always on",
            "External",
          ]);
          const tops = segments.map(segment => Math.round(segment.top));
          expect(new Set(tops).size, "the three segments wrapped").toBe(1);

          const groupOverflow = await group.evaluate(
            element => element.scrollWidth - element.clientWidth
          );
          expect(groupOverflow, "the segments scroll sideways").toBeLessThanOrEqual(0);

          const pageOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth
          );
          expect(pageOverflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

          if (mode === "always_on") {
            await expect(page.locator('[data-test="screen-now-state"]')).toHaveCount(0);
          } else {
            await expect(page.locator('[data-test="screen-now-state"]')).toBeVisible();
          }
          if (mode === "external") {
            await expect(page.locator('[data-test="screen-power-keys"]')).toBeVisible();
          }

          if (SHOTS) {
            await page.evaluate(() => document.fonts.ready);
            // The section is taller than a wall panel: shoot it on a tall
            // viewport, like the brightness review screenshots do, so no sticky
            // top bar or scroll edge lands in the frame.
            const original = page.viewportSize();
            await page.setViewportSize({ width: original.width, height: 1900 });
            await section.scrollIntoViewIfNeeded();
            await page.evaluate(() =>
              Promise.all(
                document
                  .getAnimations()
                  .filter(
                    animation => animation.effect?.getComputedTiming().iterations !== Infinity
                  )
                  .map(animation => animation.finished.catch(() => {}))
              )
            );
            await section.screenshot({
              path: path.join(SHOTS, `${sizeName}-${themeName}-${mode}.png`),
            });
            await page.setViewportSize(original);
          }

          expect(api.hostActions).toEqual([]);
          expect(api.unmatched).toEqual([]);
          expect(consoleErrors).toEqual([]);
        });
      }
    });
  }
}
