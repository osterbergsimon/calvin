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
