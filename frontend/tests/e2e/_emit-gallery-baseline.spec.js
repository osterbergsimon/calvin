/**
 * TEMPORARY (calvin-ip3l): report the gallery layout from CI so the local
 * renderer can be matched before regenerating the visual baselines.
 * Delete this file before merging.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

test.skip(({ browserName }) => browserName !== "chromium", "baselines are chromium-only");

test("report ui gallery 390 layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/ui-gallery.html?theme=dark`);
  await expect(page.locator('[data-test="ui-gallery"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.locator('[data-test="gallery-text-field-focus"]').locator("input").focus();
  await page.addStyleTag({
    content:
      '[data-test="gallery-progress-bar"], [data-test="gallery-field-table"] { display: none !important; }',
  });

  const report = await page.evaluate(() => {
    const top = el => Math.round(el.getBoundingClientRect().top + window.scrollY);
    const size = el => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    };
    const sections = [...document.querySelectorAll(".ui-gallery__heading")].map(el => ({
      name: el.textContent.trim(),
      top: top(el),
      size: size(el.parentElement),
    }));
    const root = document.querySelector('[data-test="ui-gallery"]');
    const children = [...root.children].map(el => ({
      top: top(el),
      size: size(el),
      cls: typeof el.className === "string" ? el.className : "",
    }));
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      sections,
      children,
      emoji: document.fonts.check('16px "Noto Color Emoji"'),
    };
  });
  writeFileSync("/tmp/gallery-layout.json", JSON.stringify(report, null, 2));
  throw new Error("REPORT:" + JSON.stringify(report));
});
