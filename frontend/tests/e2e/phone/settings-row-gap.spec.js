/**
 * calvin-4txw — Settings rows with two controls leave a gap between them.
 * Runs at the phone size (390x844) and the 800x480 wall panel, in light and
 * Backlit, through the API mock only. Set ROW_GAP_SHOTS=<dir> to write the
 * review screenshots (docs/design/mocks/setting-row-gap/); ROW_GAP_STATE
 * prefixes their names with before or after.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { KIOSK } from "./fixtures/navigation.js";
import { checkRowGaps } from "../fixtures/setting-row-gap.js";

const SIZES = [
  ["phone", null, { width: 390, height: 844 }],
  ["kiosk", "workshop", KIOSK],
];

const THEMES = ["light", "backlit"];

for (const [size, kiosk, viewport] of SIZES) {
  for (const theme of THEMES) {
    test.describe(`setting row gap — ${size} ${theme}`, () => {
      test.use({ viewport, hasTouch: true, isMobile: size === "phone" });

      test("two controls in one row are at least 8px apart", async ({ page, consoleErrors }) => {
        const { api } = await checkRowGaps(page, { size, theme, kiosk });

        expect(api.hostActions).toEqual([]);
        expect(api.unmatched).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
