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

  describe("handoff between frames (one light, no gap)", () => {
    // Step through time 50 ms at a time and check the invariants at every step:
    // never two lights, and never dark while work is active and a light was up.
    const stepAndCheck = (ms, { expectLit = true } = {}) => {
      for (let t = 0; t < ms; t += 50) {
        vi.advanceTimersByTime(50);
        expect(store.visibleFrames.length).toBeLessThanOrEqual(1);
        if (expectLit && store.active) expect(store.visibleFrames.length).toBe(1);
      }
    };

    it("moves a showing region light to the app at once when a second region begins", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(400);
      expect(store.visibleFrames).toEqual(["r1"]);
      vi.advanceTimersByTime(100); // 500 ms
      store.begin("photos:r2", { regionId: "r2" });
      expect(store.visibleFrames).toEqual([APP_FRAME]);
      stepAndCheck(2000);
      expect(store.visibleFrames).toEqual([APP_FRAME]);
    });

    it("moves a long-showing region light to the app with no dark gap", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(400);
      stepAndCheck(5000);
      store.begin("photos:r2", { regionId: "r2" });
      expect(store.visibleFrames).toEqual([APP_FRAME]);
      stepAndCheck(1000);
    });

    it("hands the app light back to the region at once, with no dark gap", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(400);
      stepAndCheck(1000);
      store.begin("photos:r2", { regionId: "r2" });
      stepAndCheck(3000);
      store.end("photos:r2");
      // The light stays on the app until the change settles (same tick), then
      // moves to r1 in one step.
      expect(store.visibleFrames).toEqual([APP_FRAME]);
      vi.advanceTimersByTime(0);
      expect(store.visibleFrames).toEqual(["r1"]);
      stepAndCheck(3000);
      expect(store.visibleFrames).toEqual(["r1"]);
    });

    it("keeps the minimum from when the light first showed, across a move", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(400); // shown at 400
      store.begin("photos:r2", { regionId: "r2" }); // moved to app at 400
      vi.advanceTimersByTime(100); // 500
      store.end("calendar:r1");
      store.end("photos:r2");
      // Shown at 400 → held until 1200, not 500 + 800.
      vi.advanceTimersByTime(699);
      expect(store.visibleFrames.length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(store.visibleFrames).toEqual([]);
    });

    it("does not hand back to a region whose work ended in the same tick", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      store.begin("photos:r2", { regionId: "r2" });
      vi.advanceTimersByTime(1000); // app light up since 400
      store.end("calendar:r1"); // r2 alone for a moment...
      store.end("photos:r2"); // ...then nothing is loading
      // The light stays on the app frame until it hides; it never jumps to r2
      // after all work has finished.
      for (let t = 0; t < 1000; t += 50) {
        expect(store.visibleFrames).not.toContain("r2");
        expect(store.visibleFrames.length).toBeLessThanOrEqual(1);
        vi.advanceTimersByTime(50);
      }
      expect(store.visibleFrames).toEqual([]);
    });

    it("hands back to a region that is still loading once the change settles", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      store.begin("photos:r2", { regionId: "r2" });
      vi.advanceTimersByTime(1000);
      store.end("calendar:r1");
      store.end("photos:r2");
      store.begin("photos:r2", { regionId: "r2" }); // a refetch in the same tick
      vi.advanceTimersByTime(0);
      expect(store.visibleFrames).toEqual(["r2"]);
    });

    it("lights a waiting region when the app light hides before the handback settles", () => {
      store.begin("statusbar");
      vi.advanceTimersByTime(2000); // app light up since 400
      // Queued before end(), so it runs ahead of the app light's 300 ms hide
      // timer; the handback timer it schedules then runs after the hide.
      setTimeout(() => store.begin("photos:r2", { regionId: "r2" }), 300);
      store.end("statusbar");
      vi.advanceTimersByTime(350); // begin, hide and handback have all run
      expect(store.active).toBe(true);
      expect(store.visibleFrames).toEqual([]);
      // The light was already dark, so the region waits a fresh 400 ms delay
      // and then lights; it never stays dark for the rest of its work.
      vi.advanceTimersByTime(400);
      expect(store.visibleFrames).toEqual(["r2"]);
      for (let t = 0; t < 3000; t += 50) {
        vi.advanceTimersByTime(50);
        expect(store.visibleFrames).toEqual(["r2"]);
      }
    });

    it("an app source arriving while a region light shows takes it over at once", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(600);
      store.begin("statusbar");
      expect(store.visibleFrames).toEqual([APP_FRAME]);
      stepAndCheck(1000);
      store.end("statusbar");
      vi.advanceTimersByTime(0);
      expect(store.visibleFrames).toEqual(["r1"]);
      stepAndCheck(1000);
    });

    it("a frame that never showed still waits out the 400 ms from the first begin", () => {
      store.begin("calendar:r1", { regionId: "r1" });
      vi.advanceTimersByTime(200);
      store.begin("photos:r2", { regionId: "r2" });
      vi.advanceTimersByTime(199); // 399 ms since work began
      expect(store.visibleFrames).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(store.visibleFrames).toEqual([APP_FRAME]);
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
