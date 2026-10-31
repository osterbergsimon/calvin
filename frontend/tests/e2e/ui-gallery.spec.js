/**
 * Visual snapshots of the UI gallery (docs/design/frontend-doctrine.md §3).
 *
 * Every shared block appears in the gallery; the snapshot makes any visual
 * change to a block show up as a diff in review instead of on the wall. The
 * gallery is a dev-only page, so this spec is the only place it is rendered in
 * CI. Baselines are committed next to this file.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// The built-in palettes are the app's source of truth (backend/data/themes);
// Calvin itself lives in theme.css.
const builtinThemes = JSON.parse(
  readFileSync(new URL("../../../backend/data/themes/builtin.json", import.meta.url), "utf8")
);
const themeCss = readFileSync(new URL("../../src/styles/theme.css", import.meta.url), "utf8");
const cssPalette = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  const vars = {};
  for (const [, name, value] of block[1].matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/gm)) {
    vars[name] = value;
  }
  return vars;
};
const CALVIN = { variables: cssPalette(":root"), dark_mode: cssPalette(".dark") };

const VIEWPORTS = [
  { name: "1280", size: { width: 1280, height: 800 } },
  { name: "390", size: { width: 390, height: 844 } },
];

const THEMES = ["light", "dark"];

async function openGallery(page, theme) {
  await page.goto(`/ui-gallery.html?theme=${theme}`);
  await expect(page.locator('[data-test="ui-gallery"]')).toBeVisible();
  // Bundled @fontsource faces; the snapshot must not race the swap.
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // One real focus state in the page: the TextField with a validation error.
  await page.locator('[data-test="gallery-text-field-focus"]').locator("input").focus();
}

test.describe("ui gallery palettes", () => {
  test("the switcher reaches every built-in theme in light and dark", async ({ page }) => {
    await page.goto("/ui-gallery.html?theme=calvin");
    const gallery = page.locator('[data-test="ui-gallery"]');

    for (const name of ["Calvin", "Ocean", "Forest", "Sunset"]) {
      for (const mode of ["Light", "Dark"]) {
        await page.getByRole("radio", { name, exact: true }).click();
        await page.getByRole("radio", { name: mode, exact: true }).click();

        const theme = name.toLowerCase();
        const palette = theme === "calvin" ? CALVIN : builtinThemes[theme];
        const expected = mode === "Dark" ? palette.dark_mode["bg-0"] : palette.variables["bg-0"];

        await expect(gallery).toHaveAttribute("data-theme", theme);
        await expect(gallery).toHaveAttribute("data-mode", mode.toLowerCase());
        const actual = await gallery.evaluate(el =>
          getComputedStyle(el).getPropertyValue("--bg-0").trim()
        );
        expect(actual.toUpperCase()).toBe(expected.toUpperCase());
      }
    }
  });
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`ui gallery ${viewport.name} · ${theme}`, () => {
      test.use({ viewport: viewport.size });

      test("every block, light and Backlit", async ({ page }) => {
        await openGallery(page, theme);
        await expect(page.locator('[data-test="gallery-button"]')).toBeVisible();
        await expect(page.locator('[data-test="gallery-dialog"]')).toBeVisible();
        await expect(page).toHaveScreenshot(`ui-gallery-${viewport.name}-${theme}.png`, {
          fullPage: true,
          animations: "disabled",
          // Font rasterisation differs slightly between distros; keep the
          // allowance tight enough that a real block change still shows.
          maxDiffPixelRatio: 0.01,
        });
      });

      test("the dialog states", async ({ page }) => {
        await openGallery(page, theme);

        await page.locator('[data-test="open-dialog"]').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveScreenshot(
          `ui-gallery-dialog-${viewport.name}-${theme}.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.01 }
        );

        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
        await expect(page.getByRole("dialog")).toBeHidden();

        await page.locator('[data-test="open-confirm"]').click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveScreenshot(
          `ui-gallery-confirm-${viewport.name}-${theme}.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.01 }
        );
      });
    });
  }
}
