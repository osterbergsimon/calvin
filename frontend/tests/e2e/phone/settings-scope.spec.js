/**
 * settings-scope §7 item 10 — the regression tests for where a setting writes.
 *
 * Everything here runs against the phone/kiosk API mock: nothing reaches a real
 * Calvin backend, and host-acting routes are intercepted by the fixture.
 *
 * The exhaustive per-descriptor write checks live in
 * tests/unit/components/settings/SettingsScopeWrites.spec.js, which iterates
 * SCREEN_SETTING_DESCRIPTORS so a new row is covered automatically. This spec
 * pins the same contracts through the real browser UI.
 */

import { expect } from "@playwright/test";
import { test } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { KIOSK, gotoSettings, gotoDashboard, expectSettingsReady } from "./fixtures/navigation.js";

const THEME_CONTROL = /^Light or dark:/;

async function hideControlsFromOverflow(page) {
  await page.getByRole("button", { name: "More controls" }).click();
  await page.getByRole("menuitem", { name: "Hide controls" }).click();
  await page
    .getByRole("dialog", { name: "Hide controls?" })
    .getByRole("button", { name: "Hide controls" })
    .click();
}

test.describe("settings scope — screens write only that screen", () => {
  test("a plain browser editing a screen writes its overrides, never /api/config", async ({
    page,
  }) => {
    const api = await installApiMock(page);
    await gotoSettings(page, "Screens");
    await expectSettingsReady(page);

    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();

    // One row per moved group: Look, Display, Effects & focus and Controls.
    await page.locator("#section-screen-look").getByRole("button", { name: THEME_CONTROL }).click();
    await page.getByRole("option", { name: "Dark", exact: true }).click();
    await expect.poll(() => api.overridesByKiosk.hallway?.themeMode).toBe("dark");

    await page
      .locator("#section-screen-display")
      .getByText("Dashboard size")
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /^Dashboard size:/ }).click();
    await page.getByRole("option", { name: "Large", exact: true }).click();
    await expect.poll(() => api.overridesByKiosk.hallway?.touchControlSize).toBe("large");

    await page.locator("#section-screen-effects").getByLabel("Dim other regions").click();
    await expect.poll(() => api.overridesByKiosk.hallway?.focusLightDimOthers).toBe(false);

    await page.locator("#section-screen-controls").getByLabel("Hide controls").click();
    await expect.poll(() => api.overridesByKiosk.hallway?.showUI).toBe(false);

    // It is that screen's layer, not the household config.
    expect(api.requests).toContain("PUT /api/kiosks/hallway/overrides");
    expect(api.configPosts).toEqual([]);
    expect(api.unmatched).toEqual([]);
  });

  test("a kiosk browser editing another screen writes that other screen", async ({ page }) => {
    const api = await installApiMock(page);
    await gotoSettings(page, "Screens", { kiosk: "hallway" });
    await expectSettingsReady(page);

    // The kiosk itself is one screen in the list; edit Workshop instead.
    await page.locator('[data-test="screen-card"]', { hasText: "Workshop" }).first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();

    await page
      .locator("#section-screen-controls")
      .getByLabel("Tap anywhere to show controls")
      .click();
    await expect.poll(() => api.overridesByKiosk.workshop?.tapAnywhereReveal).toBe(true);
    expect(api.overridesByKiosk.hallway?.tapAnywhereReveal).toBeUndefined();
    expect(api.configPosts).toEqual([]);
    expect(api.unmatched).toEqual([]);
  });
});

test.describe("settings scope — Default writes the household config", () => {
  test("every section's row reaches /api/config and no screen layer", async ({ page }) => {
    const api = await installApiMock(page);
    await gotoSettings(page, "Screens");
    await expectSettingsReady(page);
    await page.locator('[data-test="screen-default-card"]').click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();

    await page.locator("#section-screen-look").getByRole("button", { name: THEME_CONTROL }).click();
    await page.getByRole("option", { name: "Dark", exact: true }).click();
    await expect.poll(() => api.config.themeMode).toBe("dark");

    await page.locator("#section-screen-effects").getByLabel("Dim other regions").click();
    await expect.poll(() => api.config.focusLightDimOthers).toBe(false);

    await page.locator("#section-screen-controls").getByLabel("Hide controls").click();
    await expect.poll(() => api.config.showUI).toBe(false);

    expect(api.configPosts.length).toBeGreaterThanOrEqual(3);
    // F1: nothing here may write a screen's override or this browser's copy.
    expect(api.overridesRequests).toEqual([]);
    expect(api.unmatched).toEqual([]);
  });
});

test.describe("settings scope — theme does not leak to the household (H2)", () => {
  test("a kiosk loading a different theme and font never POSTs /api/config", async ({ page }) => {
    const api = await installApiMock(page, {
      config: { themeMode: "dark", selectedTheme: null, typeTheme: "marquee" },
    });

    await page.goto("/?kiosk=hallway");
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue("--font-display"))
      )
      .toContain("Space Grotesk");

    expect(api.configPosts).toEqual([]);
    expect(api.config.themeMode).toBe("dark");
  });

  test("a plain browser editing a screen's Look keeps its own theme", async ({ page }) => {
    const api = await installApiMock(page, { config: { themeMode: "light" } });
    await gotoSettings(page, "Screens");
    await expectSettingsReady(page);

    await page.locator('[data-test="screen-card"]').first().click();
    await expect(page.locator('[data-test="screens-detail"]')).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/light/);

    await page.locator("#section-screen-look").getByRole("button", { name: THEME_CONTROL }).click();
    await page.getByRole("option", { name: "Dark", exact: true }).click();

    await expect.poll(() => api.overridesByKiosk.hallway?.themeMode).toBe("dark");
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(api.configPosts).toEqual([]);
  });
});

test.describe("settings scope — signpost, old links and search", () => {
  test("Dashboard signposts the moved groups and no longer holds them", async ({ page }) => {
    await installApiMock(page);
    await gotoSettings(page, "Dashboard");
    await expectSettingsReady(page);

    const dashboard = page.locator(".dashboard-settings");
    const signpost = dashboard.locator('[data-test="dashboard-screen-signpost"]');
    await expect(signpost).toContainText("Look, focus light and controls are set per screen.");
    await expect(dashboard.locator("#section-appearance")).toHaveCount(0);

    for (const label of [
      "Appearance",
      "Look",
      "Theme",
      "Light or dark",
      "Font",
      "Settings text size",
      "Dashboard size",
      "Hide controls",
      "Keep the clock bar when hidden",
      "Tap anywhere to show controls",
      "Focus light",
      "Dim other regions",
      "Show button presses",
      "Label size",
    ]) {
      await expect(dashboard.getByText(label, { exact: true }), label).toHaveCount(0);
    }
    await expect(dashboard.getByText("Focus & remote", { exact: true })).toHaveCount(0);

    await signpost.getByRole("button", { name: "Open Screens" }).click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
    for (const section of ["screen-look", "screen-effects", "screen-controls"]) {
      await expect(page.locator(`#section-${section}`)).toBeVisible();
    }
  });

  test("old deep links open the matching Screens section", async ({ page }) => {
    await installApiMock(page);
    for (const [setting, section] of [
      ["dashboard-ui", "screen-look"],
      ["dashboard-kiosk-focus", "screen-effects"],
      ["dashboard-kiosk", "screen-controls"],
    ]) {
      await page.goto(`/settings?setting=${setting}`);
      await expect(page.locator(".settings-page")).toBeVisible();
      await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
      await expect(page.locator(`#section-${section}`), setting).toBeVisible();
    }
  });

  test("search finds the moved rows by their old words", async ({ page }) => {
    await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);

    const search = page.getByRole("searchbox", { name: "Search settings" });
    // The phone emulation's fill/type events do not reach this v-model input in
    // this browser build, so drive the same input event a keypress produces.
    const typeSearch = value =>
      search.evaluate((element, text) => {
        element.value = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);

    const cases = [
      ["appearance", /Look: theme, light or dark and font/],
      ["focus", /Effects, focus light and button labels/],
      ["hot corner", /Controls/],
      ["controls", /Controls/],
    ];
    for (const [word, label] of cases) {
      await typeSearch(word);
      await expect(page.getByRole("option", { name: label }), word).toBeVisible();
    }

    await typeSearch("appearance");
    await page.getByRole("option", { name: /Look: theme, light or dark and font/ }).click();
    await expect(page.locator('[data-test="default-screen-page"]')).toBeVisible();
    await expect(page.locator("#section-screen-look")).toBeVisible();
  });
});

test.describe("settings scope — the dashboard Hide controls toggle (F2)", () => {
  test.use({ viewport: KIOSK, hasTouch: true, isMobile: false });

  test("a kiosk without admin sends PATCH {showUI} only and keeps it after reload", async ({
    page,
  }) => {
    const api = await installApiMock(page, {
      auth: { configured: true, authenticated: false },
    });

    await page.goto("/?kiosk=hallway");
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForLoadState("networkidle");

    await hideControlsFromOverflow(page);

    await expect.poll(() => api.overridesByKiosk.hallway?.showUI).toBe(false);
    const writes = api.overridesRequests.filter(request => request.method === "PATCH");
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({ overrides: { showUI: false } });
    // Not a whole-layer PUT (admin-only on the real backend) and not the household.
    expect(api.overridesRequests.filter(request => request.method === "PUT")).toEqual([]);
    expect(api.configPosts).toEqual([]);

    // The kiosk's merged config now has the choice, so a reload stays hidden.
    await page.reload();
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "More controls" })).toHaveCount(0);
    expect(api.configPosts).toEqual([]);
  });

  test("a plain browser keeps its own choice across a reload", async ({ page }) => {
    const api = await installApiMock(page);
    await gotoDashboard(page);

    await hideControlsFromOverflow(page);
    expect(await page.evaluate(() => localStorage.getItem("calvin-screen-showUI"))).toBe("false");
    expect(api.overridesRequests).toEqual([]);
    expect(api.configPosts).toEqual([]);

    await page.reload();
    await expect(page.locator("#app")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "More controls" })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("calvin-screen-showUI"))).toBe("false");
  });
});

test.describe("settings scope — retired browser keys", () => {
  test("start-up drops the retired values and keeps the live ones", async ({ page }) => {
    const retired = [
      "calvin-layout-mode",
      "calvin-screen-loadingLight",
      "calvin-screen-photoFrameEnabled",
      "calvin-screen-photoFrameTimeout",
      "calvin-screen-photoFrameSourceIds",
    ];
    const kept = {
      "calvin-screen-showUI": "true",
      "calvin-ui-size": "large",
    };

    await page.addInitScript(
      ({ retiredKeys, keptValues }) => {
        for (const key of retiredKeys) localStorage.setItem(key, "stale");
        for (const [key, value] of Object.entries(keptValues)) localStorage.setItem(key, value);
      },
      { retiredKeys: retired, keptValues: kept }
    );

    await installApiMock(page);
    await gotoDashboard(page);

    const values = await page.evaluate(
      ({ retiredKeys, keptKeys }) => ({
        retired: retiredKeys.map(key => [key, localStorage.getItem(key)]),
        kept: keptKeys.map(key => [key, localStorage.getItem(key)]),
      }),
      { retiredKeys: retired, keptKeys: Object.keys(kept) }
    );

    for (const [key, value] of values.retired) expect(value, key).toBeNull();
    for (const [key, value] of values.kept) expect(value, key).not.toBeNull();
    expect(values.kept.find(([key]) => key === "calvin-ui-size")?.[1]).toBe("large");
  });
});
