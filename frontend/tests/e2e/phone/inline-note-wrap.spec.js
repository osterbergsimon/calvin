/**
 * InlineNote keeps its status icon beside the text when the text wraps
 * (calvin-cdva). The icon belongs to the note's first line; an action drops
 * below the text (or sits at its end), lined up with the text, not the icon.
 *
 * Real notes from Settings › Screens, answered by fixtures/api-mock.js:
 * a long warn line (the count line), a long err line (a wrong pairing code)
 * and a warn note with an action (Add a screen when no one-time code comes).
 *
 * INLINE_NOTE_SHOTS=before|after also writes element screenshots to
 * docs/design/mocks/inline-note/ for the PR.
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { installApiMock } from "./fixtures/api-mock.js";
import {
  KIOSK,
  PHONE,
  expectSettingsReady,
  gotoSettings,
  selectCategory,
} from "./fixtures/navigation.js";

const SHOTS = process.env.INLINE_NOTE_SHOTS || "";
const SHOT_DIR = resolve(process.cwd(), "../docs/design/mocks/inline-note");

/** Icon on the text's first line, to its left; an action lined up with the text. */
async function expectIconBesideText(note) {
  const box = await note.evaluate(element => {
    const rect = selector => element.querySelector(selector)?.getBoundingClientRect() ?? null;
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return {
      icon: rect(".inline-note__icon"),
      text: rect(".inline-note__text"),
      action: rect(".inline-note__action"),
      lineHeight,
    };
  });
  expect(box.icon, "the note has a status icon").not.toBeNull();
  // Same first line: the icon's top is within one line of the text's top.
  expect(Math.abs(box.icon.top - box.text.top)).toBeLessThan(box.lineHeight);
  // Beside, not above: the text starts to the right of the icon.
  expect(box.text.left).toBeGreaterThanOrEqual(box.icon.right);
  if (box.action) {
    // Below the text or at its end, never back under the icon.
    expect(box.action.left).toBeGreaterThanOrEqual(box.text.left - 1);
  }
}

async function shoot(note, name) {
  if (!SHOTS) return;
  await note.screenshot({ path: `${SHOT_DIR}/${SHOTS}-${name}.png` });
}

const frames = [
  { name: "phone-light", viewport: PHONE, themeMode: "light" },
  { name: "phone-dark", viewport: PHONE, themeMode: "dark" },
  { name: "kiosk-light", viewport: KIOSK, themeMode: "light" },
  { name: "kiosk-dark", viewport: KIOSK, themeMode: "dark" },
];

for (const frame of frames) {
  test.describe(`InlineNote wrapping, ${frame.name}`, () => {
    test.use({ viewport: frame.viewport });

    test("a long warn line and a wrong-code err line keep the icon beside the text", async ({
      page,
    }) => {
      await installApiMock(page, { config: { themeMode: frame.themeMode } });
      await gotoSettings(page);
      await expectSettingsReady(page);
      await selectCategory(page, "Screens");

      const count = page.locator("[data-test='screens-count-line']");
      await expect(count).toContainText("Another device on your home network");
      await shoot(count, `count-line-${frame.name}`);
      await expectIconBesideText(count);

      await page.locator("[data-test='pair-code-input']").fill("K7Q4ND");
      await page.locator("[data-test='pair-screen-btn']").click();
      const result = page.locator("[data-test='pair-result']");
      await expect(result).toContainText("No screen is showing that code.");
      await shoot(result, `wrong-code-${frame.name}`);
      await expectIconBesideText(result);
    });

    test("a warn note with an action keeps the icon beside the text", async ({ page }) => {
      await installApiMock(page, {
        config: { themeMode: frame.themeMode },
        overrides: [
          [
            /^\/api\/kiosks\/install-codes$/,
            route =>
              route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ detail: "boom" }),
              }),
          ],
        ],
      });
      await gotoSettings(page);
      await expectSettingsReady(page);
      await selectCategory(page, "Screens");

      await page.locator("[data-test='add-screen-btn']").click();
      const note = page.locator("[data-test='add-kiosk-code-note']");
      await expect(note).toContainText("Couldn't get a one-time code.");
      await expect(note.locator("[data-test='install-new-code']")).toHaveText("Try again");
      await shoot(note, `with-action-${frame.name}`);
      await expectIconBesideText(note);
    });
  });
}
