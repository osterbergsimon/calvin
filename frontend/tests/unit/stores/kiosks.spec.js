import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

  it("refreshKiosks merges presence and software fields without replacing overrides", async () => {
    const store = useKiosksStore();
    store.kiosks = [
      {
        id: "k1",
        hostname: "pi",
        lastSeen: "2026-07-12T00:00:00Z",
        agentVersion: "old",
        overrides: { displayName: "Draft name", orientation: "portrait" },
      },
    ];
    api.get.mockResolvedValueOnce({
      data: {
        kiosks: [
          {
            id: "k1",
            hostname: "pi",
            lastSeen: "2026-07-12T00:00:30Z",
            agentVersion: "new",
            agentUpdateStatus: "ok",
            overrides: { displayName: "Server name" },
          },
        ],
      },
    });

    await store.refreshKiosks();

    expect(store.kiosks[0]).toMatchObject({
      lastSeen: "2026-07-12T00:00:30Z",
      agentVersion: "new",
      agentUpdateStatus: "ok",
    });
    expect(store.kiosks[0].overrides).toEqual({
      displayName: "Draft name",
      orientation: "portrait",
    });
  });

  it("refreshKiosks ignores an older response that arrives after the latest refresh", async () => {
    const store = useKiosksStore();
    let resolveFirst;
    let resolveSecond;
    api.get
      .mockReturnValueOnce(new Promise(resolve => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise(resolve => (resolveSecond = resolve)));

    const first = store.refreshKiosks();
    const second = store.refreshKiosks();
    resolveSecond({ data: { kiosks: [{ id: "k1", lastSeen: "newest" }] } });
    await second;
    resolveFirst({ data: { kiosks: [{ id: "k1", lastSeen: "stale" }] } });
    await first;

    expect(store.kiosks[0].lastSeen).toBe("newest");
  });

  it("refreshKiosks quietly keeps the current list when the request fails", async () => {
    const store = useKiosksStore();
    store.kiosks = [{ id: "k1", lastSeen: "2026-07-12T00:00:00Z" }];
    const current = store.kiosks;
    api.get.mockRejectedValueOnce(new Error("offline"));

    await store.refreshKiosks();

    expect(store.kiosks).toBe(current);
    expect(store.kiosks[0].lastSeen).toBe("2026-07-12T00:00:00Z");
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

  it("mergeOverrides PATCHes only the changed keys and returns the merged layer", async () => {
    // A screen without admin may only send the keys it is changing (F2); the
    // server merges them into the layer it already has.
    api.patch.mockResolvedValue({
      data: { id: "k1", overrides: { orientation: "portrait", showUI: false } },
    });
    const store = useKiosksStore();

    const merged = await store.mergeOverrides("k1", { showUI: false });

    expect(api.patch).toHaveBeenCalledWith("/kiosks/k1/overrides", {
      overrides: { showUI: false },
    });
    expect(api.put).not.toHaveBeenCalled();
    expect(merged).toEqual({ orientation: "portrait", showUI: false });
  });

  it("mergeOverrides url-encodes the id and tolerates a bare response", async () => {
    api.patch.mockResolvedValue({ data: {} });
    const store = useKiosksStore();

    expect(await store.mergeOverrides("a/b", { showUI: true })).toBeNull();
    expect(api.patch).toHaveBeenCalledWith("/kiosks/a%2Fb/overrides", {
      overrides: { showUI: true },
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

describe("kiosks store — removeKiosk", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("deletes the screen and drops it from the list", async () => {
    api.delete.mockResolvedValue({ data: { removed: true } });
    const store = useKiosksStore();
    store.kiosks = [{ id: "a/b" }, { id: "k2" }];
    await store.removeKiosk("a/b");
    expect(api.delete).toHaveBeenCalledWith("/kiosks/a%2Fb");
    expect(store.kiosks.map(k => k.id)).toEqual(["k2"]);
  });

  it("treats a 404 as already removed", async () => {
    api.delete.mockRejectedValue({ response: { status: 404 } });
    const store = useKiosksStore();
    store.kiosks = [{ id: "k1" }, { id: "k2" }];
    await store.removeKiosk("k1");
    expect(store.kiosks.map(k => k.id)).toEqual(["k2"]);
  });

  it("an in-flight refresh cannot put the removed row back", async () => {
    let resolveGet;
    api.get.mockReturnValue(new Promise(r => (resolveGet = r)));
    api.delete.mockResolvedValue({ data: { removed: true } });
    const store = useKiosksStore();
    store.kiosks = [{ id: "k1" }, { id: "k2" }];
    const refresh = store.refreshKiosks();
    await store.removeKiosk("k1");
    resolveGet({ data: { kiosks: [{ id: "k1" }, { id: "k2" }] } });
    await refresh;
    expect(store.kiosks.map(k => k.id)).toEqual(["k2"]);
  });

  it("keeps the screen when the server refuses", async () => {
    api.delete.mockRejectedValue({ response: { status: 409 } });
    const store = useKiosksStore();
    store.kiosks = [{ id: "k1" }];
    await expect(store.removeKiosk("k1")).rejects.toBeTruthy();
    expect(store.kiosks).toHaveLength(1);
  });
});

// A hold lives outside the layer; when it changes the server drops screenNow
// from the layer, so the page's copy must drop it too or a later save brings
// an old manual choice back (calvin-2ifv).
describe("kiosks store — screen power hold", () => {
  const OLD_NOW = { power: "off", setAt: "2026-11-18T08:00:00Z" };
  const HOLD = { power: "on", setAt: "2026-11-18T12:00:00Z", by: "automation" };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("setScreenPower PUTs the power and drops screenNow from the local layer", async () => {
    const store = useKiosksStore();
    store.kiosks = [{ id: "k 1", overrides: { displayName: "Hall", screenNow: OLD_NOW } }];
    api.put.mockResolvedValueOnce({
      data: { id: "k 1", power: "schedule", held: false, setAt: null, by: null, agentHolds: true },
    });
    const view = await store.setScreenPower("k 1", "schedule");
    expect(api.put).toHaveBeenCalledWith("/kiosks/k%201/screen-power", { power: "schedule" });
    expect(view.power).toBe("schedule");
    expect(store.kiosks[0].powerHold).toBeNull();
    expect(store.kiosks[0].agentHolds).toBe(true);
    expect(store.kiosks[0].overrides).toEqual({ displayName: "Hall" });
  });

  it("fetchScreenPower reads the hold and keeps the list in step", async () => {
    const store = useKiosksStore();
    store.kiosks = [{ id: "k1", overrides: { screenNow: OLD_NOW }, powerHold: null }];
    api.get.mockResolvedValueOnce({
      data: { id: "k1", held: true, ...HOLD, agentHolds: false },
    });
    const view = await store.fetchScreenPower("k1");
    expect(api.get).toHaveBeenCalledWith("/kiosks/k1/screen-power");
    expect(view.held).toBe(true);
    expect(store.kiosks[0].powerHold).toEqual(HOLD);
    expect(store.kiosks[0].overrides).toEqual({});
  });

  it("refreshKiosks drops a stale screenNow when the hold changed elsewhere", async () => {
    const store = useKiosksStore();
    store.kiosks = [
      { id: "held", overrides: { screenNow: OLD_NOW }, powerHold: null },
      { id: "ended", overrides: { screenNow: OLD_NOW }, powerHold: HOLD },
      { id: "same", overrides: { screenNow: OLD_NOW }, powerHold: null },
    ];
    api.get.mockResolvedValueOnce({
      data: {
        kiosks: [
          { id: "held", overrides: {}, powerHold: HOLD },
          { id: "ended", overrides: {}, powerHold: null },
          { id: "same", overrides: {}, powerHold: null },
        ],
      },
    });
    await store.refreshKiosks();
    const byId = Object.fromEntries(store.kiosks.map(k => [k.id, k]));
    expect(byId.held.overrides).toEqual({});
    expect(byId.ended.overrides).toEqual({});
    expect(byId.same.overrides).toEqual({ screenNow: OLD_NOW }); // nothing changed: kept
  });
});

describe("kiosks store: pairing", () => {
  it("pairScreen approves a code and returns the named screen", async () => {
    api.post.mockResolvedValueOnce({
      data: { id: "hall", displayName: "Hall", pairedAt: "2026-11-21T10:00:00Z", replaced: false },
    });
    const store = useKiosksStore();
    const answer = await store.pairScreen("K7Q4MD");
    expect(api.post).toHaveBeenCalledWith("/kiosks/pairings", { code: "K7Q4MD" });
    expect(answer.displayName).toBe("Hall");
  });

  it("unpairScreen deletes that screen's pairing", async () => {
    api.delete.mockResolvedValueOnce({ data: { id: "hall", changed: true } });
    const store = useKiosksStore();
    const answer = await store.unpairScreen("hall");
    expect(api.delete).toHaveBeenCalledWith("/kiosks/hall/pairing");
    expect(answer.changed).toBe(true);
  });

  it("newInstallCode mints the command for a new screen", async () => {
    api.post.mockResolvedValueOnce({
      data: { code: "clv_pair_abc", expiresAt: "2026-11-21T10:30:00Z", command: "curl x" },
    });
    const store = useKiosksStore();
    const answer = await store.newInstallCode();
    expect(api.post).toHaveBeenCalledWith("/kiosks/install-codes");
    expect(answer.command).toBe("curl x");
  });

  it("loadPairings lists the screens waiting for approval", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        pending: [{ kioskId: "landing", hostname: "landing", createdAt: "x", byAgent: true }],
      },
    });
    const store = useKiosksStore();
    await store.loadPairings();
    expect(api.get).toHaveBeenCalledWith("/kiosks/pairings");
    expect(store.pairings.map(item => item.kioskId)).toEqual(["landing"]);
  });

  it("loadPairings fails quietly, because waiting rows are only a hint", async () => {
    const store = useKiosksStore();
    store.pairings = [{ kioskId: "landing" }];
    api.get.mockRejectedValueOnce(new Error("offline"));
    await store.loadPairings();
    expect(store.pairings).toEqual([]);
  });
});
