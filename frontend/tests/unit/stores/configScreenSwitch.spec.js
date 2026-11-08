/**
 * Screen switches light the app frame before the heavy render patch, and skip
 * the light on a device that just proved its switches are fast.
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

  it("skips the light once a switch has measured as fast", async () => {
    // First switch: the test clock does not advance, so it measures as fast.
    const first = store.activateDashboardScreen("a");
    expect(progress.appVisible).toBe(true);
    await flushFrames(4);
    await first;
    vi.advanceTimersByTime(1000);
    expect(progress.appVisible).toBe(false);

    // Second switch: fast-switch suppression, no light and no frame wait.
    const second = store.activateDashboardScreen("c");
    expect(progress.active).toBe(false);
    expect(progress.appVisible).toBe(false);
    expect(activeScreenId()).toBe("c");

    await flushFrames(4);
    await second;
    expect(progress.appVisible).toBe(false);
  });

  it("keeps the light for a switch that measured as slow", async () => {
    const first = store.activateDashboardScreen("a");
    await flushFrames(2); // the screen patch is about to run
    vi.advanceTimersByTime(500); // slow render on this device
    await flushFrames(2);
    await first;
    vi.advanceTimersByTime(1000);

    const second = store.activateDashboardScreen("c");
    expect(progress.appVisible).toBe(true);
    await flushFrames(4);
    await second;
  });

  it("respects the loading-light setting being off", async () => {
    store.loadingLight = "off";
    const switched = store.activateDashboardScreen("c");

    expect(progress.active).toBe(false);
    expect(activeScreenId()).toBe("c"); // no light → no extra frame wait

    await flushFrames(4);
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
