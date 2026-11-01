/**
 * calvin-ir9l — the pages editor must not flicker between its layouts.
 *
 * The owner saw it on the dev touchscreen the moment the browser went
 * fullscreen: the wide sheet and the compact bleed sheet are different sizes,
 * so deciding the layout from the sheet's own measured box made the class flip
 * on every frame. These cases pin the fullscreen touchscreen sizes (1920x1080
 * at dpr 1, 1536x864 at 1.25 and 1280x720 at 1.5) and scan window heights
 * across the threshold. Every route is mocked, host-acting ones included.
 */

import { expect } from "@playwright/test";
import { test } from "./phone/fixtures/phone-audit.js";
import { installApiMock } from "./phone/fixtures/api-mock.js";
import {
  KIOSK,
  KIOSK_ID,
  PHONE,
  gotoSettings,
  expectSettingsReady,
  selectCategory,
} from "./phone/fixtures/navigation.js";

/** Record the editor's size class; any change after the first is a flip. */
const startClassRecorder = page =>
  page.evaluate(() => {
    const el = document.querySelector(".sre-root");
    const current = () => (el.className.match(/size-[a-z]+/) || [""])[0];
    const state = { seq: [current()], observer: null };
    state.observer = new MutationObserver(() => {
      const next = current();
      if (next && state.seq[state.seq.length - 1] !== next) state.seq.push(next);
    });
    state.observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    window.__sreRecorder = state;
  });

const stopClassRecorder = page =>
  page.evaluate(() => {
    window.__sreRecorder?.observer?.disconnect();
    return window.__sreRecorder?.seq ?? [];
  });

async function openPagesEditor(page) {
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Screens");
  await page.locator('[data-test="screen-default-card"]').click();
  await page.locator('[data-test="default-edit-pages-btn"]').click();
  const editor = page.locator(".sre-root");
  await expect(editor).toBeVisible();
  return editor;
}

/** The editor's box is the same after a settle window as it was before it. */
async function expectSettled(editor) {
  const first = await editor.boundingBox();
  await editor.page().waitForTimeout(400);
  const second = await editor.boundingBox();
  expect(Math.abs(second.width - first.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.height - first.height)).toBeLessThanOrEqual(1);
}

const FULLSCREEN = [
  { name: "1920x1080 at dpr 1", viewport: { width: 1920, height: 1080 }, dpr: 1 },
  { name: "1536x864 at dpr 1.25", viewport: { width: 1536, height: 864 }, dpr: 1.25 },
  { name: "1280x720 at dpr 1.5", viewport: { width: 1280, height: 720 }, dpr: 1.5 },
];

for (const setup of FULLSCREEN) {
  test.describe(`fullscreen touchscreen ${setup.name}`, () => {
    test.use({
      viewport: setup.viewport,
      deviceScaleFactor: setup.dpr,
      hasTouch: true,
    });

    test("the pages editor settles in its wide layout", async ({ page, consoleErrors }) => {
      const api = await installApiMock(page);
      const editor = await openPagesEditor(page);

      await startClassRecorder(page);
      await page.waitForTimeout(1200);
      const seq = await stopClassRecorder(page);
      expect(seq).toEqual(["size-wide"]);
      await expectSettled(editor);

      expect(api.hostActions).toEqual([]);
      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

for (const dpr of [1, 1.25, 1.5]) {
  test.describe(`height scan around the threshold at dpr ${dpr}`, () => {
    test.use({
      viewport: { width: 1280, height: 600 },
      deviceScaleFactor: dpr,
      hasTouch: true,
    });

    test("changes class at most once per viewport height and settles", async ({
      page,
      consoleErrors,
    }) => {
      const api = await installApiMock(page);
      await openPagesEditor(page);

      // Ascending across 640: wide needs the width and height thresholds plus
      // the deadband, so it takes over once the window is clearly large enough.
      let sawWide = false;
      for (const height of [600, 620, 640, 650, 660, 680, 700]) {
        await startClassRecorder(page);
        await page.setViewportSize({ width: 1280, height });
        await page.waitForTimeout(700);
        const seq = await stopClassRecorder(page);
        const trail = `height ${height}: ${seq.join(" -> ")}`;

        // One change is the layout following the window; more is the flicker.
        expect(seq.length, trail).toBeLessThanOrEqual(2);
        const final = seq[seq.length - 1];
        if (sawWide) expect(final, trail).toBe("size-wide");
        if (final === "size-wide") sawWide = true;
      }
      expect(await page.locator(".sre-root").getAttribute("class")).toContain("size-wide");

      // Coming back down it leaves Wide once it is clearly short, and only then.
      await startClassRecorder(page);
      await page.setViewportSize({ width: 1280, height: 600 });
      await page.waitForTimeout(700);
      const back = await stopClassRecorder(page);
      expect(back.length, `back to 600: ${back.join(" -> ")}`).toBeLessThanOrEqual(2);
      expect(back[back.length - 1]).toBe("size-compact");
      await expectSettled(page.locator(".sre-root"));

      expect(api.hostActions).toEqual([]);
      expect(api.unmatched).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe("800x480 touch kiosk", () => {
  test.use({ viewport: KIOSK, hasTouch: true });

  test("the pages editor stays in its compact layout", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page, null, { kiosk: KIOSK_ID });
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");
    await page.locator('[data-test="screen-default-card"]').click();
    await page.locator('[data-test="default-edit-pages-btn"]').click();
    const editor = page.locator(".sre-root");
    await expect(editor).toBeVisible();

    await startClassRecorder(page);
    await page.waitForTimeout(1000);
    const seq = await stopClassRecorder(page);
    expect(seq).toEqual(["size-compact"]);
    await expectSettled(editor);

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("390x844 phone", () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test("the pages editor stays in its phone layout", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    const editor = await openPagesEditor(page);

    await startClassRecorder(page);
    await page.waitForTimeout(1000);
    const seq = await stopClassRecorder(page);
    expect(seq).toEqual(["size-phone"]);
    await expectSettled(editor);

    expect(api.hostActions).toEqual([]);
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
