/**
 * TEMPORARY (calvin-ip3l): emit the CI-rendered gallery screenshots as base64
 * in the job log so the baselines can be regenerated on the same renderer.
 * Delete this file before merging.
 */
import { test, expect } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "baselines are chromium-only");

const REVERT = "";

for (const theme of ["dark", "light"]) {
  test(`emit ui gallery 390 ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ui-gallery.html?theme=${theme}`);
    await expect(page.locator('[data-test="ui-gallery"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.locator('[data-test="gallery-text-field-focus"]').locator("input").focus();
    await page.addStyleTag({
      content:
        '[data-test="gallery-progress-bar"], [data-test="gallery-field-table"] { display: none !important; }',
    });
    const buffer = await page.screenshot({ fullPage: true, animations: "disabled" });
    const b64 = buffer.toString("base64");
    const tag = `GALLERY_BASE64_390_${theme.toUpperCase()}`;
    console.log(`${tag}_START`);
    for (let i = 0; i < b64.length; i += 4000) console.log(b64.slice(i, i + 4000));
    console.log(`${tag}_END`);
    expect(REVERT).toBe("never");
  });
}
