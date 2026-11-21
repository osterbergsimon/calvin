/**
 * Part F — pairing on a phone: the count line, a screen's pairing line, the
 * waiting list, Pair a screen, Only paired screens, and the one-time install
 * code in Add a screen. Every request is answered by fixtures/api-mock.js.
 */

import { expect } from "@playwright/test";
import { test, expectPhoneLayout } from "./fixtures/phone-audit.js";
import { installApiMock } from "./fixtures/api-mock.js";
import { PHONE, expectSettingsReady, gotoSettings, selectCategory } from "./fixtures/navigation.js";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const now = new Date().toISOString();

test.describe("phone: kiosk pairing in Settings", () => {
  test("lists the state, pairs a screen and asks before Only paired screens", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page, {
      pendingPairings: [{ kioskId: "garage", hostname: "Garage", createdAt: now, byAgent: true }],
    });
    api.kiosks.push({
      id: "office",
      hostname: "office",
      lastSeen: now,
      agentVersion: "1.6.0",
      agentPairs: true,
      paired: false,
      pairedAt: null,
      presenceHidden: false,
      overrides: { displayName: "Office" },
    });
    api.pairingAnswer = {
      id: "garage",
      displayName: "Garage",
      pairedAt: now,
      replaced: false,
    };
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");

    await expect(page.locator("[data-test='screens-category']")).toBeVisible();
    await expect(page.locator("[data-test='screens-count-line']")).toContainText(
      "1 of 3 screens seen this week are paired."
    );
    await expect(page.locator("[data-test='screen-pairing-line']")).toHaveCount(3);
    await expect(page.locator("[data-test='screen-waiting-row']")).toContainText(
      "Waiting to be paired."
    );
    await expectPhoneLayout(page, "Screens list with pairing");

    // The waiting row is not a button: it has no page to open.
    await expect(page.locator("[data-test='screen-waiting-row']")).not.toHaveAttribute(
      "role",
      "button"
    );

    await page.locator("[data-test='pair-code-input']").fill("k7q-4md ");
    await expect(page.locator("[data-test='pair-code-input']")).toHaveValue("K7Q-4MD ");
    await page.locator("[data-test='pair-screen-btn']").click();
    await expect(page.locator("[data-test='pair-result']")).toContainText("Garage is paired.");
    await expect(page.locator("[data-test='pair-result']")).toContainText("Open Garage");
    expect(api.pairRequests).toEqual([{ code: "K7Q4MD" }]);
    await expect(page.locator("[data-test='screen-waiting-row']")).toHaveCount(0);
    await expectPhoneLayout(page, "Screens list after pairing");

    // Turning on Only paired screens with an unpaired recent screen asks first.
    await page.locator("[data-test='only-paired-toggle']").click();
    await expect(page.getByText("Turn on Only paired screens?")).toBeVisible();
    await expect(page.locator(".dialog__body")).toContainText(
      "workshop-pi and Office aren't paired. They'll keep showing the dashboard, but stop reporting in and following home automation."
    );
    await expectPhoneLayout(page, "Only paired screens confirmation");
    await page.locator("[data-test='confirm-accept']").click();
    await expect.poll(() => api.config.kioskPairing).toBe("required");
    await expect(page.locator("[data-test='screens-count-line']")).toContainText(
      "Only paired screens is on"
    );

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("unpairs a screen from its own page after a confirmation", async ({
    page,
    consoleErrors,
  }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");

    await page.locator("[data-test='screen-card']").first().click();
    await expect(page.locator("[data-test='screens-detail']")).toBeVisible();
    await page.locator("[data-test='section-index-screen-pairing']").click();
    const section = page.locator("#section-screen-pairing");
    await expect(section).toContainText("Paired");
    await expectPhoneLayout(page, "a screen's Pairing section");

    await section.locator("[data-test='unpair-screen-btn']").click();
    await expect(page.getByText("Unpair hallway-pi?")).toBeVisible();
    await page.locator("[data-test='confirm-accept']").click();
    await expect(section.locator("[data-test='unpair-result']")).toContainText(
      "hallway-pi is unpaired. It shows a new code within a minute."
    );
    expect(api.unpairRequests).toEqual(["hallway"]);
    await expect(section).toContainText("Not paired");
    await expectPhoneLayout(page, "a screen after Unpair");

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("Add a screen shows the one-time install command", async ({ page, consoleErrors }) => {
    const api = await installApiMock(page);
    await gotoSettings(page);
    await expectSettingsReady(page);
    await selectCategory(page, "Screens");

    await page.locator("[data-test='add-screen-btn']").click();
    const panel = page.locator("[data-test='add-kiosk-panel']");
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-test='add-kiosk-command']")).toContainText(
      "api/kiosks/install.sh?pair="
    );
    await expect(panel.locator("[data-test='add-kiosk-code-note']")).toContainText(
      "This command works once, for 30 minutes"
    );
    expect(api.installCodeRequests).toHaveLength(1);
    await expectPhoneLayout(page, "Add a screen with a one-time code");

    await panel.locator("[data-test='install-new-code']").click();
    await expect.poll(() => api.installCodeRequests.length).toBe(2);

    expect(api.unmatched).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
