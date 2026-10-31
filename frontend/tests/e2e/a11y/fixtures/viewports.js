/**
 * Viewports and themes the accessibility baseline runs against (CLV-65).
 *
 * A phone in hand (390x844) and the wall kiosk (1280x800), each in one light
 * and one dark theme. Theme contrast itself is covered by the theme contrast
 * suite; here the theme only changes the surface axe inspects.
 */

import { expect } from "@playwright/test";

export const PHONE = { width: 390, height: 844 };
export const KIOSK = { width: 1280, height: 800 };

export const VIEWPORTS = [
  { name: "phone", size: PHONE },
  { name: "kiosk", size: KIOSK },
];

export const THEMES = ["light", "dark"];

/**
 * Wait until the app settled on the requested theme class. Config defaults to
 * `themeMode: auto`, which follows the emulated `prefers-color-scheme`.
 */
export async function expectTheme(page, theme) {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
}
