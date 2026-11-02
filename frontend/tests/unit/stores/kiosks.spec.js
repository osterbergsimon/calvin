import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("kiosks store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("loadKiosks populates the list", async () => {
    api.get.mockResolvedValue({
      data: {
        kiosks: [
          { id: "k1", hostname: "pi", lastSeen: "2026-07-12T00:00:00Z", lastAppliedVersion: null },
        ],
      },
    });
    const store = useKiosksStore();
    await store.loadKiosks();
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
    expect(api.get).toHaveBeenCalledWith("/kiosks");
  });

  it("loadKiosks falls back to cache on network error", async () => {
    api.get.mockResolvedValueOnce({ data: { kiosks: [{ id: "k1" }] } });
    const store = useKiosksStore();
    await store.loadKiosks(); // seeds cache
    api.get.mockRejectedValueOnce(new Error("offline"));
    store.kiosks = [];
    await store.loadKiosks(); // falls back
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
  });

  it("loadKiosks serves expired cache when the request fails", async () => {
    vi.useFakeTimers();
    try {
      api.get.mockResolvedValueOnce({ data: { kiosks: [{ id: "k1" }] } });
      const store = useKiosksStore();
      await store.loadKiosks(); // seeds cache
      vi.advanceTimersByTime(60 * 60 * 1000); // well past the 5 minute TTL
      api.get.mockRejectedValueOnce(new Error("offline"));
      store.kiosks = [];
      await store.loadKiosks();
      expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetchOverrides returns the layer, maps 404 to empty", async () => {
    const store = useKiosksStore();
    api.get.mockResolvedValueOnce({ data: { id: "k1", overrides: { orientation: "portrait" } } });
    expect(await store.fetchOverrides("k1")).toEqual({ orientation: "portrait" });
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await store.fetchOverrides("ghost")).toEqual({});
  });

  it("saveOverrides PUTs the layer with an encoded id", async () => {
    api.put.mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    await store.saveOverrides("a b", { orientation: "portrait" });
    expect(api.put).toHaveBeenCalledWith("/kiosks/a%20b/overrides", {
      overrides: { orientation: "portrait" },
    });
  });
});

describe("kiosks store — fetchDeviceConfigVersion", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("returns deviceConfigVersion from GET /config", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { deviceConfigVersion: "9f2a" } });
    const store = useKiosksStore();
    const v = await store.fetchDeviceConfigVersion("k1");
    expect(v).toBe("9f2a");
    expect(api.get).toHaveBeenCalledWith("/kiosks/k1/config");
  });

  it("returns null when the request fails", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("network"));
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("returns null when the field is missing", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("url-encodes the id", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { deviceConfigVersion: "x" } });
    const store = useKiosksStore();
    await store.fetchDeviceConfigVersion("a/b");
    expect(api.get).toHaveBeenCalledWith("/kiosks/a%2Fb/config");
  });
});

describe("kiosks store — triggerUpdate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("POSTs the update and refreshes the list", async () => {
    api.post.mockResolvedValue({ data: { id: "k1", requested: true } });
    api.get.mockResolvedValue({ data: { kiosks: [] } });
    const store = useKiosksStore();
    await store.triggerUpdate("k1");
    expect(api.post).toHaveBeenCalledWith("/kiosks/k1/update");
    expect(api.get).toHaveBeenCalledWith("/kiosks");
  });

  it("url-encodes the id in the POST path", async () => {
    api.post.mockResolvedValue({ data: {} });
    api.get.mockResolvedValue({ data: { kiosks: [] } });
    const store = useKiosksStore();
    await store.triggerUpdate("a/b");
    expect(api.post).toHaveBeenCalledWith("/kiosks/a%2Fb/update");
  });
});
