/**
 * Task 13, the fragment hand-off (calvin-0xns).
 *
 * The kiosk units append the screen's own secret as `#pair=…`. The browser
 * reads it and removes it from the address bar before any request, then swaps
 * it once for the HttpOnly cookie. The secret must never reach storage, a
 * request URL, a Referer or any Pinia store.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, getActivePinia, setActivePinia } from "pinia";

import api from "@/services/api";
import { captureKioskIdentity, takePairFragment } from "@/utils/kioskId";
import { usePairingStore } from "@/stores/kioskPairing";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const SECRET = `clv_kiosk_${"A".repeat(43)}`;
const MALFORMED = "clv_kiosk_too-short";

let replaceState;

function setLocation({ search = "", hash = "", hostname = "pi-kitchen" } = {}) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, hash, pathname: "/", hostname },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  api.get.mockResolvedValue({ data: { state: "none" } });
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
    window.location.hash = "";
  });
});

afterEach(() => {
  replaceState.mockRestore();
});

describe("takePairFragment", () => {
  it("reads and removes a well-formed fragment, keeping the query string", () => {
    setLocation({ search: "?kiosk=kitchen&khost=k", hash: `#pair=${SECRET}` });

    expect(takePairFragment()).toBe(SECRET);
    expect(window.location.hash).toBe("");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?kiosk=kitchen&khost=k");
  });

  it("leaves an ordinary hash alone", () => {
    setLocation({ search: "?kiosk=kitchen", hash: "#settings" });

    expect(takePairFragment()).toBeNull();
    expect(window.location.hash).toBe("#settings");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("removes a malformed fragment and returns nothing", () => {
    setLocation({ search: "?kiosk=kitchen", hash: `#pair=${MALFORMED}` });

    expect(takePairFragment()).toBeNull();
    expect(window.location.hash).toBe("");
    expect(replaceState).toHaveBeenCalled();
  });
});

describe("captureKioskIdentity", () => {
  it("removes #pair before any request and swaps it once for the cookie", async () => {
    setLocation({ search: "?kiosk=kitchen&khost=k", hash: `#pair=${SECRET}` });
    api.post.mockResolvedValue({ data: { state: "pending" } });

    const secret = captureKioskIdentity();
    expect(secret).toBe(SECRET);
    expect(window.location.hash).toBe("");
    expect(replaceState).toHaveBeenCalled();

    const store = usePairingStore();
    await store.start(secret);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/kiosks/kitchen/browser-session", null, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    // The fragment was removed before the secret was ever sent.
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      api.post.mock.invocationCallOrder[0]
    );
  });

  it("keeps the secret out of storage, the Pinia state and every request URL", async () => {
    setLocation({ search: "?kiosk=kitchen&khost=k", hash: `#pair=${SECRET}` });
    api.post.mockResolvedValue({ data: { state: "pending" } });

    const store = usePairingStore();
    await store.start(captureKioskIdentity());

    const stored = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      stored.push(sessionStorage.getItem(sessionStorage.key(i)));
    }
    for (let i = 0; i < localStorage.length; i++) {
      stored.push(localStorage.getItem(localStorage.key(i)));
    }
    expect(JSON.stringify(stored)).not.toContain("clv_kiosk_");
    expect(JSON.stringify(getActivePinia().state.value)).not.toContain("clv_kiosk_");
    for (const [url] of [...api.get.mock.calls, ...api.post.mock.calls]) {
      expect(String(url)).not.toContain("clv_kiosk_");
    }
  });

  it("removes a malformed fragment and never posts it", async () => {
    setLocation({ search: "?kiosk=kitchen", hash: `#pair=${MALFORMED}` });

    const secret = captureKioskIdentity();
    expect(secret).toBeNull();
    expect(window.location.hash).toBe("");

    await usePairingStore().start(secret);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does nothing without a kiosk id", async () => {
    setLocation({ search: "", hash: `#pair=${SECRET}` });

    const secret = captureKioskIdentity();
    expect(secret).toBeNull();

    const store = usePairingStore();
    await store.start(secret);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
    expect(store.showStrip).toBe(false);
  });

  it("does nothing inside an iframe, and leaves the fragment to the top page", async () => {
    const top = window.top;
    Object.defineProperty(window, "top", { configurable: true, value: {} });
    try {
      setLocation({ search: "?kiosk=kitchen", hash: `#pair=${SECRET}` });

      expect(captureKioskIdentity()).toBeNull();
      expect(window.location.hash).toBe(`#pair=${SECRET}`);

      await usePairingStore().start(null);
      expect(api.post).not.toHaveBeenCalled();
      expect(api.get).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "top", { configurable: true, value: top });
    }
  });
});
