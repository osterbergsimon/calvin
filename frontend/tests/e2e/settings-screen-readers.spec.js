/**
 * calvin-kajl PR 5 — the Settings shell for screen readers.
 *
 * The rail is a named nav around a list, the page has one main landmark and a
 * hidden h1, and the top bar's two actions are real Buttons. The plan's e2e
 * check is that the category buttons resolve by their names. Everything is
 * mocked (tests/e2e/phone/fixtures/api-mock.js); nothing reaches a server.
 *
 * Set SR_SHOTS=<dir> to write the review screenshots
 * (docs/design/mocks/audit-settings-sr/); SR_STATE prefixes their names with
 * before or after.
 */

import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings } from "./phone/fixtures/navigation.js";

const SHOTS = process.env.SR_SHOTS || "";
const STATE = process.env.SR_STATE || "after";

const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 }, desktop: false },
  { name: "1280", viewport: { width: 1280, height: 720 }, desktop: true },
];

const THEMES = ["light", "backlit"];

/** The top bar itself, so the review shows only what this PR changes. */
async function shotTopBar(page, { size, theme }) {
  if (!SHOTS) return;
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".settings-topbar").screenshot({
    path: path.join(SHOTS, `${STATE}-${size}-${theme}-topbar.png`),
  });
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test.describe(`settings screen readers — ${size.name} ${theme}`, () => {
      test.use({ viewport: size.viewport, hasTouch: true, isMobile: !size.desktop });

      test("the shell is a main with a named rail and a top bar", async ({
        page,
        consoleErrors,
      }) => {
        const api = await installApiMock(page, {
          config: { themeMode: theme === "backlit" ? "dark" : "light" },
        });
        await gotoSettings(page);
        await expectSettingsReady(page);

        // Shoot first: a failing assertion must still leave the review shot.
        await shotTopBar(page, { size: size.name, theme });

        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator(".settings-page__title")).toHaveText("Settings");
        await expect(page.getByRole("img", { name: "Calvin" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

        if (size.desktop) {
          await expect(page.getByRole("navigation", { name: "Settings categories" })).toBeVisible();
          // The plan's check: a category button resolves by its name.
          await expect(page.getByRole("button", { name: "Content" }).first()).toBeVisible();
        }

        expect(api.hostActions).toEqual([]);
        expect(api.unmatched).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
