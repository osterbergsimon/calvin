import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("axios");

describe("kiosks store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("loadKiosks populates the list", async () => {
    axios.get.mockResolvedValue({
      data: {
        kiosks: [
          { id: "k1", hostname: "pi", lastSeen: "2026-07-12T00:00:00Z", lastAppliedVersion: null },
        ],
      },
    });
    const store = useKiosksStore();
    await store.loadKiosks();
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks");
  });

  it("loadKiosks falls back to cache on network error", async () => {
    axios.get.mockResolvedValueOnce({ data: { kiosks: [{ id: "k1" }] } });
    const store = useKiosksStore();
    await store.loadKiosks(); // seeds cache
    axios.get.mockRejectedValueOnce(new Error("offline"));
    store.kiosks = [];
    await store.loadKiosks(); // falls back
    expect(store.kiosks.map(k => k.id)).toEqual(["k1"]);
  });

  it("fetchOverrides returns the layer, maps 404 to empty", async () => {
    const store = useKiosksStore();
    axios.get.mockResolvedValueOnce({ data: { id: "k1", overrides: { orientation: "portrait" } } });
    expect(await store.fetchOverrides("k1")).toEqual({ orientation: "portrait" });
    axios.get.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await store.fetchOverrides("ghost")).toEqual({});
  });

  it("saveOverrides PUTs the layer with an encoded id", async () => {
    axios.put.mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    await store.saveOverrides("a b", { orientation: "portrait" });
    expect(axios.put).toHaveBeenCalledWith("/api/kiosks/a%20b/overrides", {
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
    vi.spyOn(axios, "get").mockResolvedValue({ data: { deviceConfigVersion: "9f2a" } });
    const store = useKiosksStore();
    const v = await store.fetchDeviceConfigVersion("k1");
    expect(v).toBe("9f2a");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks/k1/config");
  });

  it("returns null when the request fails", async () => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("network"));
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("returns null when the field is missing", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: {} });
    const store = useKiosksStore();
    expect(await store.fetchDeviceConfigVersion("k1")).toBeNull();
  });

  it("url-encodes the id", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { deviceConfigVersion: "x" } });
    const store = useKiosksStore();
    await store.fetchDeviceConfigVersion("a/b");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks/a%2Fb/config");
  });
});

describe("kiosks store — triggerUpdate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("POSTs the update and refreshes the list", async () => {
    axios.post.mockResolvedValue({ data: { id: "k1", requested: true } });
    axios.get.mockResolvedValue({ data: { kiosks: [] } });
    const store = useKiosksStore();
    await store.triggerUpdate("k1");
    expect(axios.post).toHaveBeenCalledWith("/api/kiosks/k1/update");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks");
  });

  it("url-encodes the id in the POST path", async () => {
    axios.post.mockResolvedValue({ data: {} });
    axios.get.mockResolvedValue({ data: { kiosks: [] } });
    const store = useKiosksStore();
    await store.triggerUpdate("a/b");
    expect(axios.post).toHaveBeenCalledWith("/api/kiosks/a%2Fb/update");
  });
});
