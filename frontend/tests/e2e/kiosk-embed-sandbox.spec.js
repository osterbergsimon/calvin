/**
 * The kiosk sandbox (calvin-eugy review B1), measured in a real engine: a page
 * framed with KIOSK_SANDBOX can neither replace the top page (target=_top) nor
 * open a popup (target=_blank, window.open). Calvin's own frames use this exact
 * string (IframeViewer, IframeRenderer), so a regression in either the string or
 * the wiring shows up here or in KioskLinks.spec.js. No real Calvin is involved:
 * every request is answered by page.route.
 */

import { expect, test } from "@playwright/test";
import { KIOSK_SANDBOX } from "../../src/utils/kioskSandbox.js";

const TOP = "https://probe.test/top";

const FRAME = `<!doctype html><body>
<a id="top" href="https://probe.test/stranded" target="_top">top</a>
<a id="blank" href="https://probe.test/popup" target="_blank">blank</a>
<button id="open" onclick="window.open('https://probe.test/popup')">open</button>
<button id="assign" onclick="try{top.location.href='https://probe.test/stranded'}catch(e){}">assign</button>
</body>`;

test.beforeEach(async ({ page }) => {
  await page.route("https://probe.test/**", route => {
    const { pathname } = new URL(route.request().url());
    const html =
      pathname === "/top"
        ? `<!doctype html><body><iframe id="f" src="/frame" sandbox="${KIOSK_SANDBOX}" width="400" height="200"></iframe></body>`
        : pathname === "/frame"
          ? FRAME
          : `<!doctype html><body>navigated to ${pathname}</body>`;
    return route.fulfill({ contentType: "text/html", body: html });
  });
});

for (const target of ["#top", "#blank", "#open", "#assign"]) {
  test(`a framed page cannot leave via ${target}`, async ({ page, context }) => {
    const popups = [];
    context.on("page", p => popups.push(p));
    await page.goto(TOP);
    const frame = page.frameLocator("#f");
    await frame.locator(target).click();
    await page.waitForTimeout(600);
    expect(page.url()).toBe(TOP);
    expect(popups).toHaveLength(0);
  });
}

test("without the sandbox the same links do leave (the probe is meaningful)", async ({ page }) => {
  await page.route("https://probe.test/unsandboxed", route =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body><iframe id="f" src="/frame" width="400" height="200"></iframe></body>`,
    })
  );
  await page.goto("https://probe.test/unsandboxed");
  await page.frameLocator("#f").locator("#top").click();
  await expect.poll(() => page.url()).toBe("https://probe.test/stranded");
});
