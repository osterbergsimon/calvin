/**
 * TEMPORARY (calvin-ip3l): report the gallery layout + platform font from CI.
 * Delete this file before merging.
 */
import { test, expect } from "@playwright/test";

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
    const sections = [...document.querySelectorAll(".ui-gallery__heading")].map(el => ({
      name: el.textContent.trim(),
      top: top(el),
      size: [Math.round(el.parentElement.getBoundingClientRect().width), Math.round(el.parentElement.getBoundingClientRect().height)],
    }));
    const note = [...document.querySelectorAll(".ui-gallery__note")].find(n =>
      n.textContent.includes("Lead · body")
    );
    return { scrollHeight: document.documentElement.scrollHeight, sections, noteHeight: note.getBoundingClientRect().height };
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".ui-gallery__note",
  });
  const fonts = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });

  throw new Error(
    "REPORT:" + JSON.stringify({ report, fonts: fonts.fonts.map(f => f.familyName) })
  );
});
