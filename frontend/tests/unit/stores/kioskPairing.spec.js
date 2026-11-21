/**
 * The kiosk pairing store (Task 13, calvin-0xns).
 *
 * It owns the screen's own pairing state: a 10 s poll while pending, the
 * browser-only start (three config answers in a row, at least 3 minutes, with
 * no agent), and the strip's visibility. Nothing here ever holds the secret.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import api from "@/services/api";
import { captureKioskIdentity } from "@/utils/kioskId";
import { usePairingStore } from "@/stores/kioskPairing";
import { useConfigStore } from "@/stores/config";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const SECRET = `clv_kiosk_${"B".repeat(43)}`;
const PENDING = { state: "pending", code: "K7Q-4MD", expiresAt: "2026-11-21T10:10:00Z" };
const NONE = { state: "none" };

let replaceState;

function setLocation({ search = "?kiosk=kitchen", hash = "", hostname = "pi-kitchen" } = {}) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, hash, pathname: "/", hostname },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  sessionStorage.clear();
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
    window.location.hash = "";
  });
  setLocation();
  captureKioskIdentity();
  api.get.mockResolvedValue({ data: NONE });
  api.post.mockResolvedValue({ data: { state: "pending" } });
});

afterEach(() => {
  replaceState.mockRestore();
  vi.useRealTimers();
});

describe("pairing poll", () => {
  it("polls every 10 seconds while pending and stops once paired", async () => {
    vi.useFakeTimers();
    api.get
      .mockResolvedValueOnce({ data: PENDING })
      .mockResolvedValueOnce({ data: PENDING })
      .mockResolvedValue({ data: { state: "paired" } });

    const store = usePairingStore();
    await store.poll();

    expect(store.state).toBe("pending");
    expect(store.code).toBe("K7Q-4MD");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/kiosks/kitchen/pair");

    await vi.advanceTimersByTimeAsync(10000);
    expect(api.get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10000);
    expect(store.state).toBe("paired");
    expect(store.code).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60000);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("replaces a changed code in place", async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValueOnce({ data: PENDING }).mockResolvedValueOnce({
      data: { state: "pending", code: "ABC-DEF", expiresAt: "2026-11-21T10:20:00Z" },
    });

    const store = usePairingStore();
    await store.poll();
    expect(store.code).toBe("K7Q-4MD");

    await vi.advanceTimersByTimeAsync(10000);
    expect(store.code).toBe("ABC-DEF");
    expect(store.showStrip).toBe(true);
  });

  it("shows no strip without a code, and nothing on an old server", async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });

    const store = usePairingStore();
    await store.start();
    expect(store.state).toBe("none");
    expect(store.showStrip).toBe(false);
  });

  it("fails quietly when browser-session is not known to the server", async () => {
    setLocation({ search: "?kiosk=kitchen", hash: `#pair=${SECRET}` });
    api.post.mockRejectedValue({ response: { status: 401 } });

    const store = usePairingStore();
    await store.start(captureKioskIdentity());

    expect(store.state).toBe("none");
    expect(store.showStrip).toBe(false);
    expect(window.location.hash).toBe("");
  });
});

describe("browser-only pairing", () => {
  const unpairedNoAgent = {
    state: "unpaired",
    mode: "optional",
    hasAgent: false,
    browser: "unpaired",
  };

  it("starts after three config answers in a row, at least 3 minutes apart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));
    api.post.mockResolvedValue({ data: { state: "pending" } });

    const store = usePairingStore();
    await store.observeConfig(unpairedNoAgent);
    expect(api.post).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-21T10:01:30Z"));
    await store.observeConfig(unpairedNoAgent);
    expect(api.post).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-21T10:03:00Z"));
    await store.observeConfig(unpairedNoAgent);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/pair", { browser: true });
  });

  it("never starts when an agent is there", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));

    const store = usePairingStore();
    for (const minutes of [0, 1.5, 3, 4.5]) {
      vi.setSystemTime(new Date(new Date("2026-11-21T10:00:00Z").getTime() + minutes * 60000));
      await store.observeConfig({ ...unpairedNoAgent, hasAgent: true });
    }

    expect(api.post).not.toHaveBeenCalled();
  });

  it("needs a fresh streak after an agent answers", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-11-21T10:00:00Z").getTime();
    const at = minutes => vi.setSystemTime(new Date(t0 + minutes * 60000));

    const store = usePairingStore();
    at(0);
    await store.observeConfig(unpairedNoAgent);
    at(1);
    await store.observeConfig({ ...unpairedNoAgent, hasAgent: true });
    at(2);
    await store.observeConfig(unpairedNoAgent);
    at(3);
    await store.observeConfig(unpairedNoAgent);
    expect(api.post).not.toHaveBeenCalled();

    at(5);
    await store.observeConfig(unpairedNoAgent);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the server has no kioskAuth (an old server)", async () => {
    const store = usePairingStore();
    await store.observeConfig(undefined);

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("reads kioskAuth from a config answer (the store is wired to the fetch)", async () => {
    api.get.mockImplementation(url =>
      String(url).includes("/config")
        ? Promise.resolve({ data: { kioskAuth: unpairedNoAgent } })
        : Promise.resolve({ data: NONE })
    );

    await useConfigStore().fetchConfig();

    expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/kiosks/kitchen/pair"));
  });

  it("does nothing inside an iframe", async () => {
    const top = window.top;
    Object.defineProperty(window, "top", { configurable: true, value: {} });
    try {
      const store = usePairingStore();
      await store.observeConfig(unpairedNoAgent);
      await store.start();
      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "top", { configurable: true, value: top });
    }
  });
});
