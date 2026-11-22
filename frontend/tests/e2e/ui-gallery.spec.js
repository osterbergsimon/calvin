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
        await expect(page.locator('[data-test="gallery-tabs"]')).toBeVisible();
        await expect(page.locator('[data-test="gallery-dialog"]')).toBeVisible();
        // calvin-mwqo: the ProgressBar block is newer than these baselines.
        // Hidden here until CI-rendered baselines that include it are adopted;
        // the a11y gallery audit and ProgressBar.spec.js still cover it.
        // Follow-up calvin-4qdt: generate the baselines in CI, then delete
        // this addStyleTag. FieldTable (screen schedule) waits on the same
        // follow-up; its own unit spec covers the block meanwhile.
        await page.addStyleTag({
          content:
            '[data-test="gallery-progress-bar"], [data-test="gallery-field-table"] { display: none !important; }',
        });
        await expect(page).toHaveScreenshot(`ui-gallery-${viewport.name}-${theme}.png`, {
          fullPage: true,
          animations: "disabled",
          // Font rasterisation differs slightly between distros; keep the
          // allowance tight enough that a real block change still shows.
          maxDiffPixelRatio: 0.01,
        });
      });

      test("the popover, menu and colour field states", async ({ page }) => {
        await openGallery(page, theme);

        await page.locator('[data-test="gallery-menu-trigger"]').click();
        const menu = page.getByRole("menu", { name: "More actions for Family calendar" });
        await expect(menu).toBeVisible();
        // Playwright counts an off-screen fixed panel as visible; assert it is
        // actually inside the viewport and anchored by its trigger.
        const box = await menu.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.size.width);
        expect(box.bottom).toBeLessThanOrEqual(viewport.size.height);
        await expect(menu).toHaveScreenshot(`ui-gallery-menu-${viewport.name}-${theme}.png`, {
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
        });
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();

        await page.locator('[data-test="gallery-popover-trigger"]').click();
        const explainer = page.getByRole("dialog", { name: "About the connection" });
        await expect(explainer).toBeVisible();
        await expect(explainer).toHaveScreenshot(
          `ui-gallery-popover-${viewport.name}-${theme}.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.01 }
        );
        await page.keyboard.press("Escape");
        await expect(explainer).toBeHidden();

        await page.locator('[data-test="gallery-colour-field"] .colour-field__trigger').click();
        const colourPicker = page.getByRole("dialog", { name: "Colour for Family calendar" });
        await expect(colourPicker).toBeVisible();
        await expect(colourPicker).toHaveScreenshot(
          `ui-gallery-colour-field-${viewport.name}-${theme}.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.01 }
        );
        await page.keyboard.press("Escape");
        await expect(colourPicker).toBeHidden();
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

// Windows High Contrast drops author colours and box-shadows, so state and
// focus must not depend on them (calvin-kajl M2). These cases run the gallery
// with forced colours on and check the three blocks whose state is drawn with
// colour alone.
test.describe("ui gallery under forced colours", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  async function openForcedGallery(page) {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/ui-gallery.html?theme=light");
    await expect(page.locator('[data-test="ui-gallery"]')).toBeVisible();
  }

  // The system colours the browser actually paints with. Comparing against
  // these tells a real mark apart from a colour that forced colours flattened
  // to Canvas.
  async function systemColours(page) {
    return page.evaluate(() => {
      const resolve = property => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = property;
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      return {
        canvas: resolve("Canvas"),
        canvasText: resolve("CanvasText"),
        highlight: resolve("Highlight"),
        highlightText: resolve("HighlightText"),
        buttonText: resolve("ButtonText"),
      };
    });
  }

  test("the switch keeps a visible track, knob and on state", async ({ page }) => {
    await openForcedGallery(page);
    const colours = await systemColours(page);
    const read = locator =>
      locator.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          borderWidth: style.borderTopWidth,
          borderStyle: style.borderTopStyle,
          borderColour: style.borderTopColor,
          background: style.backgroundColor,
          knob: getComputedStyle(el, "::after").backgroundColor,
        };
      });

    const off = await read(page.getByRole("switch", { name: "Warnings" }));
    expect(off.borderStyle).toBe("solid");
    expect(parseFloat(off.borderWidth)).toBeGreaterThanOrEqual(1);
    expect(off.borderColour).toBe(colours.buttonText);
    expect(off.knob).toBe(colours.buttonText);

    const on = await read(page.getByRole("switch", { name: "Daily summary" }));
    expect(on.background).toBe(colours.highlight);
    expect(on.knob).toBe(colours.highlightText);
  });

  test("the selected segment is filled and keeps its focus ring", async ({ page }) => {
    await openForcedGallery(page);
    const colours = await systemColours(page);
    const selected = page.getByRole("radiogroup", { name: "Mode" }).locator(".seg__btn.on");

    const fill = await selected.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, colour: style.color };
    });
    expect(fill.background).toBe(colours.highlight);
    expect(fill.colour).toBe(colours.highlightText);

    await selected.focus();
    const focus = await selected.evaluate(el => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, offset: style.outlineOffset };
    });
    expect(focus.style).toBe("solid");
    expect(focus.offset).toBe("2px");
  });

  test("the active tab keeps its underline", async ({ page }) => {
    await openForcedGallery(page);
    const colours = await systemColours(page);
    const active = page
      .getByRole("tablist", { name: "Gallery pages" })
      .locator(".tabs__tab.is-active");

    const marks = await active.evaluate(el => {
      const style = getComputedStyle(el);
      const underline = getComputedStyle(el, "::after");
      return {
        outline:
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
            ? style.outlineColor
            : null,
        underline: parseFloat(underline.height) > 0 ? underline.backgroundColor : null,
      };
    });
    expect(marks.outline === colours.highlight || marks.underline === colours.highlight).toBe(true);
  });

  test("the progress bar keeps its track and fill", async ({ page }) => {
    await openForcedGallery(page);
    const colours = await systemColours(page);
    const bar = page.locator('[data-test="gallery-progress-bar"] .progress-bar');
    const read = locator =>
      locator.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          borderWidth: style.borderTopWidth,
          borderStyle: style.borderTopStyle,
          borderColour: style.borderTopColor,
          background: style.backgroundColor,
        };
      });

    const track = await read(bar);
    expect(track.borderStyle).toBe("solid");
    expect(parseFloat(track.borderWidth)).toBeGreaterThanOrEqual(1);
    expect(track.borderColour).toBe(colours.canvasText);

    const fill = await read(bar.locator(".progress-bar__fill"));
    expect(fill.background).toBe(colours.highlight);
  });

  test("the colour dots keep their swatch", async ({ page }) => {
    await openForcedGallery(page);
    const colours = await systemColours(page);
    const dot = page
      .locator('[data-test="gallery-colour-field"] .colour-field__dot--choice')
      .first();

    const swatch = await dot.evaluate(el => {
      const style = getComputedStyle(el);
      return { adjust: style.forcedColorAdjust, background: style.backgroundColor };
    });
    expect(swatch.adjust).toBe("none");
    expect(swatch.background).not.toBe(colours.canvas);
  });
});
