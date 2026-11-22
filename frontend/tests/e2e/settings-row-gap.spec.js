/**
 * calvin-4txw — the desktop half of the Settings row gap check: at 1280x720
 * "Turn on now" and "Turn off now", and Turn off / Turn on on the server's
 * display row, must sit at least 8px apart. The phone and wall-panel sizes run
 * in tests/e2e/phone/settings-row-gap.spec.js; everything is mocked.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { checkRowGaps } from "./fixtures/setting-row-gap.js";

test.describe("setting row gap — desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("two controls in one row are at least 8px apart", async ({ page, consoleErrors }) => {
    const { api } = await checkRowGaps(page, {
      size: "desktop",
      theme: "light",
      shootAll: false,
    });

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
