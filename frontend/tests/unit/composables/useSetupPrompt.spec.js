import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import {
  _resetSetupPromptForTests,
  SETUP_WELCOME_DISMISSED_KEY,
  useSetupPrompt,
} from "@/composables/useSetupPrompt";

const REGIONS = [
  { key: "cal", kind: "calendar" },
  { key: "photos", kind: "photos" },
  { key: "pages", kind: "service" },
];

const prompt = useSetupPrompt();

const reportAll = () => {
  prompt.report("cal", { area: 400, height: 500 });
  prompt.report("photos", { area: 300, height: 500 });
  prompt.report("pages", { area: 200, height: 500 });
};

describe("useSetupPrompt (CLV-20)", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetSetupPromptForTests();
    prompt.setContentRegions(REGIONS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is none before a region reports missing setup", () => {
    expect(prompt.mode.value).toBe("none");
  });

  it("is welcome only when every content region is setup-empty", () => {
    prompt.report("cal", { area: 400, height: 500 });
    prompt.report("photos", { area: 300, height: 500 });
    expect(prompt.mode.value).toBe("gaps");

    prompt.report("pages", { area: 200, height: 500 });
    expect(prompt.mode.value).toBe("welcome");
  });

  it("is gaps when some regions have content", () => {
    prompt.report("photos", { area: 300, height: 500 });
    expect(prompt.mode.value).toBe("gaps");
    expect(prompt.missing.value.map(region => region.kind)).toEqual(["photos"]);
  });

  it("is none when a reported region gets content", async () => {
    reportAll();
    prompt.clear("cal");
    prompt.clear("photos");
    prompt.clear("pages");
    await nextTick();
    expect(prompt.mode.value).toBe("none");
  });

  it("keeps the welcome card open while one of several gaps is filled", () => {
    reportAll();
    expect(prompt.mode.value).toBe("welcome");
    prompt.clear("cal");
    expect(prompt.mode.value).toBe("welcome");
    expect(prompt.items.value.find(item => item.kind === "calendar").added).toBe(true);
  });

  it("picks the largest area as qrOwner, ties in layout order", () => {
    prompt.report("cal", { area: 100, height: 500 });
    prompt.report("photos", { area: 300, height: 500 });
    prompt.report("pages", { area: 300, height: 500 });
    expect(prompt.qrOwner.value).toBe("photos");
  });

  it("moves the QR to the next region that has room for it", () => {
    prompt.report("cal", { area: 900, height: 300 }); // too short for the QR
    prompt.report("photos", { area: 300, height: 500 });
    prompt.report("pages", { area: 200, height: 500 });
    expect(prompt.qrOwner.value).toBe("photos");
  });

  it("has no qrOwner when no empty region fits the QR", () => {
    prompt.report("cal", { area: 900, height: 300 });
    prompt.report("photos", { area: 300, height: 200 });
    expect(prompt.qrOwner.value).toBe(null);
  });

  it("deep-links to the only missing setting, else to Settings' landing page", () => {
    prompt.report("cal", { area: 400, height: 500 });
    expect(prompt.qrSettingId.value).toBe("content-calendars");

    prompt.report("photos", { area: 300, height: 500 });
    expect(prompt.qrSettingId.value).toBe(null);
  });

  it("'Not now' switches to gaps and persists per device", () => {
    reportAll();
    prompt.dismissWelcome();
    expect(prompt.mode.value).toBe("gaps");
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe("1");

    _resetSetupPromptForTests();
    prompt.setContentRegions(REGIONS);
    reportAll();
    expect(prompt.mode.value).toBe("gaps");
  });

  it("clears the dismissal once the device sees nothing missing", async () => {
    reportAll();
    prompt.dismissWelcome();
    prompt.markSettled();
    prompt.clear("cal");
    prompt.clear("photos");
    prompt.clear("pages");
    await nextTick();
    expect(prompt.mode.value).toBe("none");
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe(null);
    expect(prompt.dismissed.value).toBe(false);
  });

  it("does not clear a dismissal before the screen has settled", async () => {
    reportAll();
    prompt.dismissWelcome();
    prompt.setContentRegions([{ key: "cal", kind: "calendar" }]);
    await nextTick();
    // No report yet for the new screen: this is not "all configured".
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe("1");
  });

  it("does not clear the dismissal when the first settle beats the regions", async () => {
    // Slow kiosk: the 600ms timer marks the screen settled while its regions
    // (and their data) have not reported yet. That is not "someone filled the
    // last gap", so "Not now" must survive and the card must not come back.
    localStorage.setItem(SETUP_WELCOME_DISMISSED_KEY, "1");
    _resetSetupPromptForTests();
    prompt.setContentRegions(REGIONS);

    prompt.markSettled();
    await nextTick();
    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe("1");

    reportAll();
    expect(prompt.mode.value).toBe("gaps");
  });

  it("keeps the dismissal when leaving the dashboard clears the reports", async () => {
    reportAll();
    prompt.dismissWelcome();

    // Dashboard onBeforeUnmount → detach, then its EmptyStates clear on unmount.
    prompt.detach();
    for (const region of REGIONS) prompt.clear(region.key);
    await nextTick();

    expect(localStorage.getItem(SETUP_WELCOME_DISMISSED_KEY)).toBe("1");
  });

  it("hides for the page load when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    _resetSetupPromptForTests();
    prompt.setContentRegions(REGIONS);
    reportAll();
    expect(prompt.mode.value).toBe("welcome");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => prompt.dismissWelcome()).not.toThrow();
    expect(prompt.mode.value).toBe("gaps");
  });
});
