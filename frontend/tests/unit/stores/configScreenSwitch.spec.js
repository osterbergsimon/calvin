/**
 * Screen switches light the app frame and move the screen dot before the heavy
 * render patch; every change (tap or key) acknowledges itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
  logWarn: vi.fn(),
}));

import api from "@/services/api";
import { useConfigStore } from "@/stores/config";
import { useProgressStore } from "@/stores/progress";

const SCREENS = {
  version: 2,
  activeScreenId: "b",
  screens: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("config store — screen switch loading light (calvin-0iqy)", () => {
  let store;
  let progress;
  let rafQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    rafQueue = [];
    vi.stubGlobal("requestAnimationFrame", callback => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    setActivePinia(createPinia());
    api.post.mockResolvedValue({ data: {} });
    store = useConfigStore();
    progress = useProgressStore();
    store.dashboardScreens = SCREENS;
    store.loadingLight = "comet";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // One animation frame: run the callbacks queued for it, then let the
  // continuations (including Vue's nextTick) run before the next frame.
  const flushFrame = async () => {
    const callbacks = rafQueue.splice(0);
    callbacks.forEach(callback => callback(0));
    await Promise.resolve();
    await Promise.resolve();
  };

  const flushFrames = async count => {
    for (let index = 0; index < count; index += 1) await flushFrame();
  };

  const activeScreenId = () => store.effectiveDashboardScreens.activeScreenId;

  it("lights the app frame synchronously, before the active screen changes", () => {
    store.activateDashboardScreen("c");

    expect(progress.appVisible).toBe(true);
    expect(activeScreenId()).toBe("b");
  });

  it("changes the screen only after a painted frame", async () => {
    const switched = store.activateDashboardScreen("c");
    expect(activeScreenId()).toBe("b");
    expect(rafQueue.length).toBe(1);

    await flushFrame();
    expect(activeScreenId()).toBe("b");
    expect(rafQueue.length).toBe(1);

    await flushFrame();
    expect(activeScreenId()).toBe("c");

    await flushFrames(4);
    await switched;
  });

  it("ends the source once the new screen has settled", async () => {
    const switched = store.activateDashboardScreen("c");
    await flushFrames(4);
    await switched;

    expect(progress.active).toBe(false);
    expect(progress.appVisible).toBe(true); // held for the switch minimum
    vi.advanceTimersByTime(299);
    expect(progress.appVisible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(progress.appVisible).toBe(false);
  });

  it("ends the light when the screen settles, not when the config save finishes", async () => {
    let finishSave;
    api.post.mockImplementation(() => new Promise(resolve => (finishSave = resolve)));

    const switched = store.activateDashboardScreen("c");
    await flushFrames(4);

    expect(activeScreenId()).toBe("c");
    expect(progress.active).toBe(false);

    finishSave({ data: {} });
    await switched;
  });

  it("still lights a switch that follows a fast one (calvin-6yja)", async () => {
    // The test clock does not advance, so the first switch measures as fast.
    const first = store.activateDashboardScreen("a");
    await flushFrames(4);
    await first;
    vi.advanceTimersByTime(1000);
    expect(progress.appVisible).toBe(false);

    const second = store.activateDashboardScreen("c");
    expect(progress.appVisible).toBe(true);
    expect(activeScreenId()).toBe("a"); // light first, patch after a painted frame

    await flushFrames(4);
    await second;
    expect(activeScreenId()).toBe("c");
  });

  it("lights next/previous screen keys like a tap (calvin-6yja)", async () => {
    const cycled = store.cycleDashboardScreenBy(1);
    expect(progress.appVisible).toBe(true);
    expect(activeScreenId()).toBe("b");

    await flushFrames(4);
    await cycled;
    expect(activeScreenId()).toBe("c");

    const back = store.cycleDashboardScreenBy(-1);
    await flushFrames(4);
    await back;
    expect(activeScreenId()).toBe("b");
  });

  it("wraps next/previous around the screen list", async () => {
    const cycled = store.cycleDashboardScreenBy(-1);
    await flushFrames(4);
    await cycled;
    expect(activeScreenId()).toBe("a");
  });

  it("moves the dot at once, before the screen changes (calvin-6yja)", async () => {
    expect(store.displayedScreenId).toBe("b");
    const switched = store.activateDashboardScreen("c");
    expect(store.displayedScreenId).toBe("c");
    expect(activeScreenId()).toBe("b");

    await flushFrames(4);
    await switched;
    expect(store.displayedScreenId).toBe("c");
    expect(store.pendingScreenId).toBe(null);
  });

  it("moves the dot for a key press too", async () => {
    const cycled = store.cycleDashboardScreenBy(1);
    expect(store.displayedScreenId).toBe("c");
    await flushFrames(4);
    await cycled;
  });

  it("with the light off the dot still moves first and no light appears", async () => {
    store.loadingLight = "off";
    const switched = store.activateDashboardScreen("c");

    expect(store.displayedScreenId).toBe("c");
    expect(activeScreenId()).toBe("b"); // painted before the commit
    expect(progress.active).toBe(false);
    expect(progress.appVisible).toBe(false);

    await flushFrames(4);
    await switched;
    expect(activeScreenId()).toBe("c");
    expect(progress.appVisible).toBe(false);
  });

  it("the newest target wins on quick repeat taps", async () => {
    const first = store.activateDashboardScreen("a");
    const second = store.activateDashboardScreen("c");
    expect(store.displayedScreenId).toBe("c");
    await flushFrames(8);
    await Promise.all([first, second]);
    expect(store.pendingScreenId).toBe(null);
    expect(store.displayedScreenId).toBe("c");
  });

  it("a refused kiosk switch leaves the dot where it was", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "calvin-test");
    try {
      store.availableScreens = ["a", "b"];
      const before = store.displayedScreenId;
      const switched = store.activateDashboardScreen("c");
      expect(store.displayedScreenId).toBe(before);
      await flushFrames(4);
      await switched;
      expect(store.displayedScreenId).toBe(before);
      expect(store.pendingScreenId).toBe(null);
    } finally {
      sessionStorage.removeItem("calvin_kiosk_id");
    }
  });

  it("kiosk switches and key cycles stay local and never write config", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "calvin-test");
    try {
      store.kioskActiveScreenId = "b";
      const tap = store.activateDashboardScreen("a");
      expect(progress.appVisible).toBe(true);
      await flushFrames(4);
      await tap;
      expect(store.kioskActiveScreenId).toBe("a");
      vi.advanceTimersByTime(1000);
      expect(progress.appVisible).toBe(false);

      const key = store.cycleDashboardScreenBy(1);
      expect(progress.appVisible).toBe(true);
      await flushFrames(4);
      await key;
      expect(store.kioskActiveScreenId).toBe("b");
      expect(api.post).not.toHaveBeenCalled();
      expect(api.put).not.toHaveBeenCalled();
    } finally {
      sessionStorage.removeItem("calvin_kiosk_id");
    }
  });

  it("respects the loading-light setting being off", async () => {
    store.loadingLight = "off";
    const switched = store.activateDashboardScreen("c");

    expect(progress.active).toBe(false);
    expect(activeScreenId()).toBe("b"); // the dot paints first (calvin-6yja)

    await flushFrames(4);
    expect(activeScreenId()).toBe("c");
    await switched;
    expect(progress.appVisible).toBe(false);
  });

  it("does nothing when the screen is already active", async () => {
    const before = store.dashboardScreens;
    const switched = store.activateDashboardScreen("b");

    expect(progress.active).toBe(false);
    expect(progress.appVisible).toBe(false);
    expect(store.dashboardScreens).toBe(before);
    expect(api.post).not.toHaveBeenCalled();

    await switched;
  });

  it("does not leave the light stuck after rapid double switches", async () => {
    const first = store.activateDashboardScreen("a");
    const second = store.activateDashboardScreen("c");
    expect(progress.appVisible).toBe(true);

    await flushFrames(8);
    await Promise.all([first, second]);

    expect(activeScreenId()).toBe("c");
    expect(progress.active).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(progress.appVisible).toBe(false);
    expect(progress.visibleFrames).toEqual([]);
  });
});
