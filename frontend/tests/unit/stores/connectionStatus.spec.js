/**
 * Connection state machine (CLV-48): two-failure debounce, retry backoff,
 * immediate online/offline handling, and the "Connected again" flash.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConnectionStore } from "@/stores/connection";

global.fetch = vi.fn();

describe("Connection store — status and retries", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      configurable: true,
      value: true,
    });
    store = useConnectionStore();
  });

  afterEach(() => {
    store.cleanup();
    vi.useRealTimers();
  });

  it("starts in 'starting' until the first check finishes", async () => {
    expect(store.status).toBe("starting");

    global.fetch.mockResolvedValue({ ok: true });
    await store.checkBackend();

    expect(store.status).toBe("ok");
  });

  it("stays OK after a single failed check (debounce)", async () => {
    global.fetch.mockResolvedValue({ ok: true });
    await store.checkBackend();
    expect(store.status).toBe("ok");

    global.fetch.mockResolvedValue({ ok: false });
    await store.checkBackend();

    expect(store.consecutiveFailures).toBe(1);
    expect(store.status).toBe("ok");
  });

  it("becomes unreachable after two consecutive failures", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await store.checkBackend();
    await store.checkBackend();

    expect(store.status).toBe("unreachable");
  });

  it("resets the failure count on a successful check", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await store.checkBackend();
    await store.checkBackend();
    expect(store.status).toBe("unreachable");

    global.fetch.mockResolvedValue({ ok: true });
    await store.checkBackend();

    expect(store.consecutiveFailures).toBe(0);
    expect(store.status).toBe("ok");
  });

  it("backs off 5s, 10s, then every 30s", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    store.initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4999);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(9999);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(29999);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(29999);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it("returns to the 30s cadence after a success", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    store.initialize();
    await vi.advanceTimersByTimeAsync(0);

    // failure 1 → retry at 5s
    await vi.advanceTimersByTimeAsync(5000);
    // failure 2 → retry at 10s, and now two in a row show as unreachable
    expect(store.status).toBe("unreachable");

    // success → next check only after the normal 30s
    await vi.advanceTimersByTimeAsync(10000);
    expect(store.status).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30000 - 1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("goes offline immediately and checks immediately when back online", async () => {
    global.fetch.mockResolvedValue({ ok: true });
    store.initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status).toBe("ok");

    window.dispatchEvent(new Event("offline"));
    expect(store.isOnline).toBe(false);
    expect(store.status).toBe("offline");

    const callsBefore = global.fetch.mock.calls.length;
    window.dispatchEvent(new Event("online"));
    expect(store.isOnline).toBe(true);
    // The online handler checks straight away, not on the next tick.
    expect(global.fetch.mock.calls.length).toBe(callsBefore + 1);
  });

  it("does not poll while offline", async () => {
    store.isOnline = false;
    store.startHealthCheck();
    await vi.advanceTimersByTimeAsync(60000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lets fresh data from any API route end the unreachable state", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await store.checkBackend();
    await store.checkBackend();
    expect(store.status).toBe("unreachable");

    store.markBackendReachable();

    expect(store.status).toBe("ok");
    expect(store.reconnected).toBe(true);
    expect(store.lastBackendCheck).toBeInstanceOf(Date);
  });

  it("flashes 'reconnected' for 3s after coming back", async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await store.checkBackend();
    await store.checkBackend();
    expect(store.status).toBe("unreachable");

    global.fetch.mockResolvedValue({ ok: true });
    await store.checkBackend();

    expect(store.reconnected).toBe(true);
    await vi.advanceTimersByTimeAsync(2999);
    expect(store.reconnected).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.reconnected).toBe(false);
  });
});
