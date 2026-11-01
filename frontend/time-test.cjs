const { chromium } = require("playwright");
(async () => {
  for (const channel of [undefined, "chromium"]) {
    try {
      const browser = await chromium.launch({ channel });
      const page = await browser.newPage();
      page.on("crash", () => console.log(String(channel), "CRASH"));
      await page.setContent('<input type="time" step="900">');
      await page.waitForTimeout(500);
      console.log(String(channel), "input count", await page.locator("input").count());
      await browser.close();
    } catch (e) {
      console.log(String(channel), "error", e.message.split("\n")[0]);
    }
  }
})();
