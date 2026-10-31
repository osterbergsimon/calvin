/**
 * Keyboard focus walk (CLV-65).
 *
 * Remote and keyboard users need to see where focus is. This tabs through the
 * dashboard and Settings and checks the focused element (or an ancestor that
 * draws a `:focus-within` ring) shows a visible outline or shadow.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectSettingsReady, gotoSettings } from "../phone/fixtures/navigation.js";
import { test } from "./fixtures/axe-audit.js";
import { VIEWPORTS } from "./fixtures/viewports.js";

const MAX_TABS = 24;

const focusState = page =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;

    const describe = node => {
      const style = getComputedStyle(node);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        boxShadow: style.boxShadow,
      };
    };

    const own = describe(el);
    let ringed =
      (own.outlineStyle !== "none" && own.outlineWidth > 0) ||
      (own.boxShadow && own.boxShadow !== "none");

    // A focused input can be ringed by its `:focus-within` container instead.
    if (!ringed) {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const parent = describe(node);
        if (parent.outlineStyle !== "none" && parent.outlineWidth > 0) {
          ringed = true;
          break;
        }
      }
    }

    return {
      tag: el.tagName.toLowerCase(),
      className: String(el.className || "").slice(0, 60),
      text: (el.textContent || "").trim().slice(0, 40),
      ringed,
    };
  });

async function walkFocus(page, label) {
  const seen = [];
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    const state = await focusState(page);
    if (!state) continue;
    seen.push(state);
    expect(
      state.ringed,
      `${label}: no visible focus on <${state.tag} class="${state.className}"> ${state.text}`
    ).toBe(true);
  }
  // Sanity: the walk really landed on controls, not an empty page.
  expect(seen.length, `${label}: tabbing found no focusable controls`).toBeGreaterThan(3);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}: keyboard focus`, () => {
    test.use({ viewport: viewport.size });

    test("every focused control on the dashboard shows focus", async ({ page }) => {
      await installApiMock(page);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await walkFocus(page, `${viewport.name}: dashboard`);
    });

    test("every focused control in Settings shows focus", async ({ page }) => {
      await installApiMock(page);
      await gotoSettings(page);
      await expectSettingsReady(page);
      await walkFocus(page, `${viewport.name}: settings`);
    });
  });
}
