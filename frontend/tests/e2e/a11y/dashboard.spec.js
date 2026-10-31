/**
 * Dashboard accessibility audit (CLV-65).
 *
 * The dashboard is the screen everyone lives with; these audits run it with
 * the same sample calendar/photo/web data the rest of the e2e suite uses, at
 * both target sizes and in both themes.
 */

import { expect } from "@playwright/test";
import { installApiMock } from "../phone/fixtures/api-mock.js";
import { expectAccessible, test } from "./fixtures/axe-audit.js";
import { expectTheme, THEMES, VIEWPORTS } from "./fixtures/viewports.js";

function sampleEvents() {
  const at = (hour, minute = 0) => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  return [
    {
      id: "evt-standup",
      source: "src-family",
      title: "Morning stand-up",
      start: at(9),
      end: at(9, 30),
      all_day: false,
      color: "green",
      location: "Kitchen",
    },
    {
      id: "evt-appointment",
      source: "src-family",
      title: "Dentist appointment with a deliberately long name",
      start: at(14),
      end: at(15),
      all_day: false,
      color: "blue",
    },
    {
      id: "evt-dinner",
      source: "src-family",
      title: "Dinner at Anna's",
      start: at(19),
      end: at(20, 30),
      all_day: false,
      color: "orange",
    },
  ];
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} · ${theme}: dashboard`, () => {
      test.use({ viewport: viewport.size, colorScheme: theme });

      test("has no serious accessibility violations", async ({ page, consoleErrors }, testInfo) => {
        await installApiMock(page, {
          overrides: [
            [
              /^\/api\/calendar\/events$/,
              (route, { url }) =>
                route.fulfill({
                  status: 200,
                  contentType: "application/json",
                  body: JSON.stringify({
                    start_date: url.searchParams.get("start_date") || new Date().toISOString(),
                    end_date: url.searchParams.get("end_date") || new Date().toISOString(),
                    total: sampleEvents().length,
                    events: sampleEvents(),
                  }),
                }),
            ],
          ],
        });

        await page.goto("/");
        await page.locator(".app-shell").waitFor();
        await page.waitForLoadState("networkidle");
        await expectTheme(page, theme);

        await expectAccessible(page, testInfo, `${viewport.name}/${theme}: dashboard`);

        expect(consoleErrors).toEqual([]);
      });
    });
  }
}
