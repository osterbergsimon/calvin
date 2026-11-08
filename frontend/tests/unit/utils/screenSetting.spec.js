import { describe, it, expect, beforeEach } from "vitest";
import {
  RETIRED_BROWSER_SETTING_KEYS,
  removeRetiredBrowserSettings,
  screenStorageKey,
} from "@/utils/screenSetting";
import { LAYOUT_STORAGE_KEY } from "@/utils/layoutMode";

// The old Default Behaviour rows (F1) wrote these into this browser. They now
// follow the household config, so the stale copy must be removed once on start
// (settings-scope §4 "This browser").
describe("retired per-screen browser storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("lists exactly the keys that lost their browser layer", () => {
    expect(new Set(RETIRED_BROWSER_SETTING_KEYS)).toEqual(
      new Set([
        LAYOUT_STORAGE_KEY,
        screenStorageKey("loadingLight"),
        screenStorageKey("photoFrameEnabled"),
        screenStorageKey("photoFrameTimeout"),
        screenStorageKey("photoFrameSourceIds"),
      ])
    );
  });

  it("keeps the per-screen control visibility choices", () => {
    // A laptop and a wall panel answer differently, so these three keep their
    // browser layer: the ⋯ quick action must stick on the screen you are at.
    const kept = [
      screenStorageKey("showUI"),
      screenStorageKey("clockBarShowInKiosk"),
      screenStorageKey("tapAnywhereReveal"),
    ];
    for (const key of kept) window.localStorage.setItem(key, "false");

    const removed = removeRetiredBrowserSettings();

    expect(removed).not.toContain(screenStorageKey("showUI"));
    for (const key of kept) expect(window.localStorage.getItem(key), key).toBe("false");
  });

  it("removes the stale values and leaves the browser-only settings alone", () => {
    for (const key of RETIRED_BROWSER_SETTING_KEYS) {
      window.localStorage.setItem(key, "stale");
    }
    for (const key of ["calvin-touch-controls", "calvin-osk-mode", "calvin-ui-size"]) {
      window.localStorage.setItem(key, "kept");
    }

    const removed = removeRetiredBrowserSettings();

    expect(new Set(removed)).toEqual(new Set(RETIRED_BROWSER_SETTING_KEYS));
    for (const key of RETIRED_BROWSER_SETTING_KEYS) {
      expect(window.localStorage.getItem(key), key).toBeNull();
    }
    for (const key of ["calvin-touch-controls", "calvin-osk-mode", "calvin-ui-size"]) {
      expect(window.localStorage.getItem(key), key).toBe("kept");
    }
  });

  it("is idempotent and cheap once the keys are gone", () => {
    for (const key of RETIRED_BROWSER_SETTING_KEYS) {
      window.localStorage.setItem(key, "stale");
    }

    expect(removeRetiredBrowserSettings()).toHaveLength(RETIRED_BROWSER_SETTING_KEYS.length);
    expect(removeRetiredBrowserSettings()).toEqual([]);
  });
});
