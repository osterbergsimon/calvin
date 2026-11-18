/**
 * Accessibility audit for the switch-grid section of the renderer gallery
 * (homey switch tiles §3, plan Task 2.7).
 *
 * The tiles are the first plugin body a person acts on, so every state the
 * gallery shows (on, off, not responding, a refused tap, a failed tap) passes
 * the axe gate, and every tile is a touch target in both directions.
 */
import { expect } from "@playwright/test";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { THEMES, VIEWPORTS } from "./fixtures/viewports.js";

const TOUCH_TARGET = 44;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: renderer gallery switch-grid`, () => {
      test.use({ viewport: viewport.size });

      test("switch tiles are accessible in every state", async ({
        page,
        consoleErrors,
      }, testInfo) => {
        await page.goto(`/renderer-gallery.html?theme=${theme}`);
        const section = page.locator('[data-test="gallery-switch-grid"]');
        await expect(section).toBeVisible();
        const include = { include: ['[data-test="gallery-switch-grid"]'] };

        const tiles = section.locator("button.switch-tile");
        expect(await tiles.count()).toBeGreaterThanOrEqual(4);
        for (const tile of await tiles.all()) {
          const box = await tile.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
          expect(box.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
        }

        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: switch-grid`, include);

        const live = section.locator('[role="status"]');

        // A tap that works settles on the answered state.
        const works = section.getByRole("button", { name: /Lamp B/ });
        await expect(works).toHaveAttribute("aria-pressed", "false");
        await works.click();
        await expect(works).toHaveAttribute("aria-pressed", "true");
        await expect(works).toBeFocused();

        // A tap that fails returns to what it showed and says so.
        const fails = section.getByRole("button", { name: /Fan C/ });
        await fails.click();
        await expect(live).toHaveText("Fan C: Couldn't reach Homey");
        await expect(fails).toHaveAttribute("aria-pressed", "false");
        await expectAccessible(
          page,
          testInfo,
          `${viewport.name}/${theme}: switch-grid reach note`,
          include
        );

        // A refused tap turns the tile unavailable.
        const refused = section.getByRole("button", { name: /Plug E/ });
        await refused.click();
        await expect(live).toHaveText("Plug E: Can't be switched from here");
        await expect(refused).toHaveAttribute("aria-disabled", "true");
        await expect(refused).toBeFocused();
        await expectAccessible(
          page,
          testInfo,
          `${viewport.name}/${theme}: switch-grid refused`,
          include
        );

        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
