import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { logError } from "@/utils/logger";
import { APP_FRAME, PROGRESS_TIMING, useProgressStore } from "@/stores/progress";

// CLV-115: the loading light's timing and scope live in one engine, so every
// indicator style behaves the same way (docs/design/2026-11-01-loading-light.md).
describe("progress store: loading-light engine (CLV-115)", () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useProgressStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the agreed timing constants", () => {
    expect(PROGRESS_TIMING).toEqual({
      showDelayMs: 400,
      minVisibleMs: 800,
      lingerMs: 300,
      sourceCapMs: 60_000,
    });
  });

  describe("timing", () => {
    it("never shows a load that finishes inside 400 ms", () => {
      store.begin("calendar");
      vi.advanceTimersByTime(300);
      store.end("calendar");
      vi.advanceTimersByTime(2000);
      expect(store.appVisible).toBe(false);
    });

    it("shows only once a source is still active 400 ms after it began", () => {
      store.begin("calendar");
      vi.advanceTimersByTime(399);
      expect(store.appVisible).toBe(false);
      vi.advanceTimersByTime(1);
      expect(store.appVisible).toBe(true);
    });

    it("keeps a light that showed at 450 ms visible for at least 800 ms", () => {
      store.begin("calendar");
      vi.advanceTimersByTime(450);
      expect(store.appVisible).toBe(true); // shown at 400
      store.end("calendar");
      // Shown at 400 → may not hide before 1200.
      vi.advanceTimersByTime(749);
      expect(store.appVisible).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.appVisible).toBe(false);
    });

    it("lingers 300 ms after the last source ends once the minimum is met", () => {
      store.begin("calendar");
      vi.advanceTimersByTime(3000);
      store.end("calendar");
      vi.advanceTimersByTime(299);
      expect(store.appVisible).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.appVisible).toBe(false);
    });

    it("coalesces back-to-back sources within 300 ms into one continuous light", () => {
      const seen = [];
      store.begin("a");
      vi.advanceTimersByTime(2000);
      store.end("a");
      vi.advanceTimersByTime(200); // inside the linger window
      store.begin("b");
      for (let t = 0; t < 2000; t += 50) {
        vi.advanceTimersByTime(50);
        seen.push(store.appVisible);
      }
      expect(seen.every(Boolean)).toBe(true);
      store.end("b");
      vi.advanceTimersByTime(300);
      expect(store.appVisible).toBe(false);
    });

    it("runs one light while any of several overlapping sources is active", () => {
      store.begin("a");
      vi.advanceTimersByTime(500);
      store.begin("b");
      store.end("a");
      vi.advanceTimersByTime(2000);
      expect(store.appVisible).toBe(true);
      store.end("b");
      vi.advanceTimersByTime(300);
      expect(store.appVisible).toBe(false);
    });

    it("caps a stuck source at 60 s: ends it and logs", () => {
      store.begin("plugin:stuck");
      vi.advanceTimersByTime(59_999);
      expect(store.isActive("plugin:stuck")).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.isActive("plugin:stuck")).toBe(false);
      expect(logError).toHaveBeenCalledWith(
        "[Progress]",
        expect.stringContaining("plugin:stuck"),
        expect.anything()
      );
      vi.advanceTimersByTime(300);
      expect(store.appVisible).toBe(false);
    });

    it("restarts the cap when a source begins again", () => {
      store.begin("calendar");
      vi.advanceTimersByTime(50_000);
      store.begin("calendar");
      vi.advanceTimersByTime(50_000);
      expect(store.isActive("calendar")).toBe(true);
    });

    it("a source that ended does not get capped later", () => {
      store.begin("calendar");
      store.end("calendar");
      vi.advanceTimersByTime(61_000);
      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe("scope", () => {
    it("a regionId source lights that region's frame, not the app", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(500);
      expect(store.isFrameVisible("r1")).toBe(true);
      expect(store.isFrameVisible("r2")).toBe(false);
      expect(store.appVisible).toBe(false);
    });

    it("a regionless source lights the app frame", () => {
      store.begin("statusbar");
      vi.advanceTimersByTime(500);
      expect(store.isFrameVisible(APP_FRAME)).toBe(true);
      expect(store.appVisible).toBe(true);
      expect(store.isFrameVisible("r1")).toBe(false);
    });

    it("2 regions loading at once promote to one app light", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      store.begin("photos:r2", { regionId: "r2" });
      vi.advanceTimersByTime(500);
      expect(store.appVisible).toBe(true);
      expect(store.isFrameVisible("r1")).toBe(false);
      expect(store.isFrameVisible("r2")).toBe(false);
    });

    it("two sources in the same region stay on that region", () => {
      store.begin("calendar:r1:events", { regionId: "r1" });
      store.begin("calendar:r1:sources", { regionId: "r1" });
      vi.advanceTimersByTime(500);
      expect(store.isFrameVisible("r1")).toBe(true);
      expect(store.appVisible).toBe(false);
    });

    it("an app source takes over a region light (one light at a time)", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      store.begin("app:first-load");
      vi.advanceTimersByTime(500);
      expect(store.appVisible).toBe(true);
      expect(store.isFrameVisible("r1")).toBe(false);
    });

    it("a promoted light hands back to the region once only one region loads", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      store.begin("photos:r2", { regionId: "r2" });
      vi.advanceTimersByTime(1500);
      store.end("photos:r2");
      vi.advanceTimersByTime(1000);
      expect(store.appVisible).toBe(false);
      expect(store.isFrameVisible("r1")).toBe(true);
    });

    it("region frames follow the same delay and minimum rules", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(300);
      store.end("calendar:r1");
      vi.advanceTimersByTime(1000);
      expect(store.isFrameVisible("r1")).toBe(false);

      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(450);
      store.end("calendar:r1");
      vi.advanceTimersByTime(749);
      expect(store.isFrameVisible("r1")).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.isFrameVisible("r1")).toBe(false);
    });
  });

  describe("track()", () => {
    it("ends the source when the work resolves", async () => {
      let resolve;
      const work = store.track("calendar", () => new Promise(r => (resolve = r)), {
        regionId: "r1",
      });
      expect(store.active).toBe(true);
      resolve("ok");
      await expect(work).resolves.toBe("ok");
      expect(store.active).toBe(false);
    });

    it("ends the source when the work fails, and rethrows", async () => {
      const work = store.track("calendar", () => Promise.reject(new Error("boom")));
      await expect(work).rejects.toThrow("boom");
      expect(store.active).toBe(false);
    });

    it("overlapping calls with the same id each hold the light", async () => {
      let resolveFirst;
      let resolveSecond;
      const first = store.track("photos:r1", () => new Promise(r => (resolveFirst = r)));
      const second = store.track("photos:r1", () => new Promise(r => (resolveSecond = r)));
      resolveFirst();
      await first;
      expect(store.activeIds.length).toBe(1);
      resolveSecond();
      await second;
      expect(store.active).toBe(false);
    });
  });
});
