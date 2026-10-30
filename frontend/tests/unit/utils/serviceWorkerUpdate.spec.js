/** Tests for the service-worker reload/update decisions (CLV-29). */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  UPDATE_CHECK_INTERVAL_MS,
  markControllerReload,
  shouldReloadOnControllerChange,
  startUpdateChecks,
} from "@/utils/serviceWorkerUpdate";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    data,
  };
}

describe("shouldReloadOnControllerChange", () => {
  it("skips the first-install claim (previous controller was null)", () => {
    const storage = memoryStorage();

    expect(
      shouldReloadOnControllerChange({
        previousController: null,
        nextController: {},
        storage,
        now: 1_000,
      })
    ).toBe(false);
    expect(storage.data).toEqual({});
  });

  it("reloads when a new worker replaces an older one", () => {
    expect(
      shouldReloadOnControllerChange({
        previousController: { scriptURL: "sw.js#1" },
        nextController: { scriptURL: "sw.js#2" },
        storage: memoryStorage(),
        now: 1_000,
      })
    ).toBe(true);
  });

  it("does not reload when the page loses its controller", () => {
    expect(
      shouldReloadOnControllerChange({
        previousController: {},
        nextController: null,
        storage: memoryStorage(),
        now: 1_000,
      })
    ).toBe(false);
  });

  it("does not reload when the controller is unchanged", () => {
    const worker = {};

    expect(
      shouldReloadOnControllerChange({
        previousController: worker,
        nextController: worker,
        storage: memoryStorage(),
        now: 1_000,
      })
    ).toBe(false);
  });

  it("skips a second reload inside the guard window", () => {
    const storage = memoryStorage({ [RELOAD_GUARD_KEY]: String(1_000) });

    expect(
      shouldReloadOnControllerChange({
        previousController: { id: 1 },
        nextController: { id: 2 },
        storage,
        now: 1_000 + RELOAD_GUARD_MS - 1,
      })
    ).toBe(false);
  });

  it("reloads again once the guard window has passed", () => {
    const storage = memoryStorage({ [RELOAD_GUARD_KEY]: String(1_000) });

    expect(
      shouldReloadOnControllerChange({
        previousController: { id: 1 },
        nextController: { id: 2 },
        storage,
        now: 1_000 + RELOAD_GUARD_MS,
      })
    ).toBe(true);
  });

  it("still reloads when sessionStorage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(
      shouldReloadOnControllerChange({
        previousController: { id: 1 },
        nextController: { id: 2 },
        storage,
        now: 1_000,
      })
    ).toBe(true);
  });
});

describe("markControllerReload", () => {
  it("records the reload time so the next page load can guard against a loop", () => {
    const storage = memoryStorage();

    markControllerReload({ storage, now: 42_000 });

    expect(storage.data[RELOAD_GUARD_KEY]).toBe("42000");
  });

  it("never throws when storage rejects writes", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(() => markControllerReload({ storage, now: 1 })).not.toThrow();
  });
});

describe("startUpdateChecks", () => {
  let registration;

  beforeEach(() => {
    registration = { update: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function harness({ visibility = "visible" } = {}) {
    const listeners = {};
    return {
      listeners,
      documentObj: {
        visibilityState: visibility,
        addEventListener: (type, handler) => {
          listeners[`document:${type}`] = handler;
        },
      },
      windowObj: {
        addEventListener: (type, handler) => {
          listeners[`window:${type}`] = handler;
        },
      },
    };
  }

  it("checks for a new deploy on an interval, keeping kiosks current", () => {
    vi.useFakeTimers();
    const { documentObj, windowObj } = harness();

    startUpdateChecks(registration, { documentObj, windowObj });

    expect(registration.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("checks when the page becomes visible again", () => {
    const { documentObj, windowObj, listeners } = harness();
    startUpdateChecks(registration, { documentObj, windowObj });

    listeners["document:visibilitychange"]();

    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("checks when the network comes back", () => {
    const { documentObj, windowObj, listeners } = harness();
    startUpdateChecks(registration, { documentObj, windowObj });

    listeners["window:online"]();

    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("does not check on a hidden page", () => {
    const { documentObj, windowObj, listeners } = harness({ visibility: "hidden" });
    startUpdateChecks(registration, { documentObj, windowObj });

    listeners["document:visibilitychange"]();

    expect(registration.update).not.toHaveBeenCalled();
  });

  it("swallows a failed update check", async () => {
    registration.update.mockRejectedValue(new Error("offline"));
    const { documentObj, windowObj, listeners } = harness();
    startUpdateChecks(registration, { documentObj, windowObj });

    expect(() => listeners["window:online"]()).not.toThrow();
    await Promise.resolve();
  });
});
