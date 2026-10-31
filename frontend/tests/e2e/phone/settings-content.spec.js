/**
 * CLV-66 — Content settings on a phone.
 *
 * Calendars (add + edit), photos (picker + upload), and a web page added
 * through the provider picker, all at 390x844 with a mocked backend.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, gotoSettings, expectSettingsReady, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

async function openContent(page) {
  const api = await installApiMock(page);
  await gotoSettings(page);
  await expectSettingsReady(page);
  await selectCategory(page, "Content");
  return api;
}

test.describe("phone: Content", () => {
  test("shows calendars, photo sources and web pages with sample data", async ({
    page,
    consoleErrors,
  }) => {
    await openContent(page);

    const content = page.locator(".content-settings");
    await expect(content.getByText("Family", { exact: true })).toBeVisible();
    await expect(content.getByRole("button", { name: "Add a calendar" })).toBeVisible();
    await expect(content.getByRole("button", { name: "Add photos from…" })).toBeVisible();
    await expect(content.getByRole("button", { name: "Add a web page or app" })).toBeVisible();
    await expect(content.getByText("Weather", { exact: true })).toBeVisible();
    await expect(content.getByText("Recipes", { exact: true })).toBeVisible();

    await expectPhoneLayout(page, "Content settings");
    expect(consoleErrors).toEqual([]);
  });

  test("adds a calendar through the add form", async ({ page, consoleErrors }) => {
    const api = await openContent(page);

    await page.getByRole("button", { name: "Add a calendar" }).click();
    const modal = page.locator(".dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: /Add calendar/ })).toBeVisible();

    // CLV-74: the declared label names the field, the description is the hint
    // under it, and type-level internals never appear.
    await expect(modal.getByLabel("Calendar address")).toBeVisible();
    await expect(modal.getByText("The .ics address to read events from.")).toBeVisible();
    await expect(modal.getByText("display_order")).toHaveCount(0);
    await expect(modal.getByText("Colour", { exact: true })).toBeVisible();
    await expect(modal.getByRole("switch", { name: "Show event times" })).toBeVisible();
    await expect(modal.getByRole("switch", { name: "Enabled" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Test connection" })).toBeVisible();
    await expect(modal.locator('input[type="checkbox"]')).toHaveCount(0);

    // CLV-83: the add form uses ColourField: a "Colour" label above a radiogroup
    // of named theme swatches plus "Custom…", with no hex box or native input.
    const colourLayout = await page.evaluate(() => {
      const root = document.querySelector(".dialog");
      const label = root.querySelector(".colour-field__label");
      const group = root.querySelector('.colour-field [role="radiogroup"]');
      const labelRect = label.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      return {
        labelText: label.textContent.trim(),
        labelAboveGroup: labelRect.bottom <= groupRect.top + 1,
        groupName: group.getAttribute("aria-labelledby") === label.id,
        radios: group.querySelectorAll('input[type="radio"]').length,
        hexInputs: root.querySelectorAll(
          ".colour-row, .colour-label, .colour-field .text-field__input"
        ).length,
      };
    });
    expect(colourLayout.labelText).toBe("Colour");
    expect(colourLayout.labelAboveGroup).toBe(true);
    expect(colourLayout.groupName).toBe(true);
    expect(colourLayout.radios).toBeGreaterThan(1);
    expect(colourLayout.hexInputs).toBe(0);
    await expect(modal.getByRole("button", { name: "Custom…" })).toBeVisible();

    // Both switches share the dialog's own inset (no panel padding on top) and
    // keep label-left / toggle-right on a phone.
    const toggleRows = await page.evaluate(() => {
      const root = document.querySelector(".dialog");
      return [...root.querySelectorAll(".setting-row")].map(row => {
        const info = row.querySelector(".setting-row__info").getBoundingClientRect();
        const control = row.querySelector(".setting-row__control").getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        return {
          label: row.querySelector(".setting-row__label").textContent.trim(),
          paddingLeft: getComputedStyle(row).paddingLeft,
          paddingRight: getComputedStyle(row).paddingRight,
          controlRightOfLabel: control.left >= info.right - 1,
          controlInsideRow: control.right <= rowRect.right + 1,
          sameLine: control.top < info.bottom - 1 && control.bottom > info.top + 1,
        };
      });
    });
    expect(toggleRows.map(row => row.label)).toEqual(["Show event times", "Enabled"]);
    for (const row of toggleRows) {
      expect(row.paddingLeft).toBe("0px");
      expect(row.paddingRight).toBe("0px");
      expect(row.controlRightOfLabel).toBe(true);
      expect(row.controlInsideRow).toBe(true);
      expect(row.sameLine).toBe(true);
    }
    await expect(modal.locator(".text-field__input").first()).toHaveAttribute(
      "placeholder",
      "e.g. Family"
    );

    // The plugin fields share the modal's type and control rhythm: label
    // weight/size, input height, and a tight single-line hint.
    const styles = await page.evaluate(() => {
      const root = document.querySelector(".dialog");
      const css = element => getComputedStyle(element);
      const pluginLabel = root.querySelector(".plugin-field label");
      const nameLabel = root.querySelector(".text-field__label");
      const pluginInput = root.querySelector(".plugin-field input.form-input");
      const nameInput = root.querySelector(".text-field__input");
      const hint = root.querySelector(".plugin-field .help-text");
      return {
        pluginLabel: { weight: css(pluginLabel).fontWeight, size: css(pluginLabel).fontSize },
        nameLabel: { weight: css(nameLabel).fontWeight, size: css(nameLabel).fontSize },
        pluginHeight: css(pluginInput).height,
        nameHeight: css(nameInput).height,
        hintMargin: css(hint).marginTop,
        hintSize: css(hint).fontSize,
        hintLineHeight: css(hint).lineHeight,
      };
    });
    // Both labels use a role token at the same size; the shared TextField uses
    // the row-label weight and the plugin renderer keeps its title weight.
    expect(styles.nameLabel.size).toBe(styles.pluginLabel.size);
    expect(styles.nameLabel.weight).toBe("500");
    expect(styles.pluginLabel.weight).toBe("600");
    expect(styles.pluginHeight).toBe(styles.nameHeight);
    expect(styles.hintMargin).toBe("4px");
    const lineHeight =
      styles.hintLineHeight === "normal"
        ? 1
        : parseFloat(styles.hintLineHeight) / parseFloat(styles.hintSize);
    expect(lineHeight).toBeLessThan(1.4);

    await modal.locator(".text-field__input").first().fill("Birthdays");
    await modal
      .locator('.plugin-field input[type="text"]')
      .first()
      .fill("https://example.com/birthdays.ics");

    await expectPhoneLayout(page, "add calendar form", { scope: ".dialog" });
    await modal.getByRole("button", { name: "Save" }).click();

    await expect(modal).toBeHidden();
    await expect.poll(() => api.requests).toContain("POST /api/plugins/calendar-ics/instances");
    await expect.poll(() => api.requests).toContain("POST /api/calendar/sources");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("opens a row's more-actions menu inside the viewport", async ({ page, consoleErrors }) => {
    await openContent(page);
    const trigger = page
      .locator(".content-settings")
      .getByRole("button", { name: /^More actions for / })
      .last();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole("menu").first();
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const vp = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    // Opening must not have scrolled the trigger itself out of view.
    const tb = await trigger.boundingBox();
    expect(tb.y).toBeGreaterThanOrEqual(0);
    expect(tb.y + tb.height).toBeLessThanOrEqual(vp.height);
    expect(consoleErrors).toEqual([]);
  });

  test("edits an existing calendar without leaving the phone layout", async ({
    page,
    consoleErrors,
  }) => {
    const api = await openContent(page);
    const familyRow = page.locator('.content-settings [data-source-id="src-family"]');
    await familyRow.getByRole("button", { name: "Edit" }).click();

    const modal = page.locator(".dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: /Edit Family/ })).toBeVisible();

    const name = modal.locator(".text-field__input").first();
    await expect(name).toHaveValue("Family");
    await name.fill("Family & friends");
    await expectPhoneLayout(page, "edit calendar form", { scope: ".dialog" });
    await modal.getByRole("button", { name: "Save" }).click();

    await expect(modal).toBeHidden();
    await expect.poll(() => api.requests).toContain("PUT /api/plugins/instances/src-family");
    expect(consoleErrors).toEqual([]);
  });

  test("adds a photo source and opens the device upload picker", async ({
    page,
    consoleErrors,
  }) => {
    const api = await openContent(page);

    await page.getByRole("button", { name: "Add photos from…" }).click();
    const picker = page.locator(".dialog");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("heading", { name: "Add photos from…" })).toBeVisible();
    await expectPhoneLayout(page, "photo provider picker", { scope: ".dialog" });

    // The upload tile hands the same flow to the device file picker.
    await picker.locator('[data-provider-id="__upload"]').click();
    const fileInput = page.locator('[data-test="photo-upload-input"]');
    await fileInput.setInputFiles({
      name: "garden.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      ),
    });
    await expect(page.getByText(/Uploaded 1 photo/)).toBeVisible();
    await expect.poll(() => api.requests).toContain("POST /api/images/upload");

    // And a photo source itself can be added from the picker's other tile.
    await page.getByRole("button", { name: "Add photos from…" }).click();
    await page.locator('[data-provider-id="image-local"]').click();
    const modal = page.locator(".dialog");
    await expect(modal).toBeVisible();
    await modal.locator(".text-field__input").first().fill("Holiday photos");
    await expectPhoneLayout(page, "add photo source form", { scope: ".dialog" });
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => api.requests).toContain("POST /api/plugins/image-local/instances");

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("adds a web page through the picker", async ({ page, consoleErrors }) => {
    const api = await openContent(page);

    await page.getByRole("button", { name: "Add a web page or app" }).click();
    const picker = page.locator(".dialog");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("heading", { name: "Add a web page or app" })).toBeVisible();
    // A web page and an app are both offered; the plain page leads.
    await expect(picker.locator('[data-provider-id="web-embed"]')).toContainText(
      "Web page (any address)"
    );
    await expect(picker.locator('[data-provider-id="mealie"]')).toBeVisible();
    await expectPhoneLayout(page, "web page picker", { scope: ".dialog" });

    await picker.locator('[data-provider-id="web-embed"]').click();
    const modal = page.locator(".dialog");
    await expect(modal.getByRole("heading", { name: /Add web page/ })).toBeVisible();
    await modal.locator(".text-field__input").first().fill("Calendar board");
    await modal
      .locator('.plugin-field input[type="text"]')
      .first()
      .fill("https://example.com/board");
    await expectPhoneLayout(page, "add web page form", { scope: ".dialog" });
    await modal.getByRole("button", { name: "Save" }).click();

    await expect(modal).toBeHidden();
    await expect.poll(() => api.requests).toContain("POST /api/plugins/web-embed/instances");
    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
