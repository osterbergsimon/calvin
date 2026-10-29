/**
 * A response the service worker replays from its cache must reach the stores
 * as an offline signal: their own cached copy is served flagged stale and the
 * localStorage entry is not rewritten (review of calvin-19u).
 *
 * Runs the real services/api.js interceptor (axios itself is mocked in
 * tests/setup.js), the real stores and the real localStorage cache.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api, { SW_CACHE_HEADER, ServiceWorkerReplayError } from "@/services/api";
import { useCalendarStore } from "@/stores/calendar";
import { useConfigStore } from "@/stores/config";
import { useConnectionStore } from "@/stores/connection";
import { useWebServicesStore } from "@/stores/webServices";
import { setCachedData } from "@/utils/cache";

// The interceptor api.js registered on import, before setup's clearAllMocks.
const [onFulfilled, onRejected] = api.interceptors.response.use.mock.calls[0];

// Answer every GET the way axios would when the service worker replays `data`.
const replayEverything = data => {
  api.get.mockImplementation(() =>
    Promise.resolve({ status: 200, data, headers: { [SW_CACHE_HEADER]: "1" } }).then(
      onFulfilled,
      onRejected
    )
  );
};

const timestampOf = key => localStorage.getItem(`calvin_cache_ts_${key}`);

describe("service worker replay reaching the stores", () => {
  let connection;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    connection = useConnectionStore();
    connection.isBackendOnline = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is rejected by the client as an offline signal", async () => {
    replayEverything({ sources: [] });

    await expect(api.get("/calendar/sources")).rejects.toBeInstanceOf(ServiceWorkerReplayError);
    expect(connection.isBackendOnline).toBe(false);
  });

  it("calendar: serves its own cache flagged stale and leaves the entry untouched", async () => {
    setCachedData("calendar_sources", { sources: [{ id: "cached" }] });
    const writtenAt = timestampOf("calendar_sources");
    vi.advanceTimersByTime(60 * 1000);
    replayEverything({ sources: [{ id: "replayed" }] });

    const store = useCalendarStore();
    await store.fetchSources();

    expect(store.sources).toEqual([{ id: "cached" }]);
    expect(store.stale).toBe(true);
    expect(store.error).toBe(null);
    expect(timestampOf("calendar_sources")).toBe(writtenAt);
  });

  it("calendar: never stores a replayed payload as fresh when it has no cache", async () => {
    replayEverything({ sources: [{ id: "replayed" }] });

    const store = useCalendarStore();
    await expect(store.fetchSources()).rejects.toBeInstanceOf(ServiceWorkerReplayError);

    expect(timestampOf("calendar_sources")).toBeNull();
  });

  it("web services: serves its own cache flagged stale and leaves the entry untouched", async () => {
    const cached = { services: [{ id: "a", name: "Cached", enabled: true, display_order: 0 }] };
    setCachedData("web_services", cached);
    const writtenAt = timestampOf("web_services");
    vi.advanceTimersByTime(60 * 1000);
    replayEverything({ plugins: [] });

    const store = useWebServicesStore();
    await store.fetchServices();

    expect(store.services.map(s => s.name)).toEqual(["Cached"]);
    expect(store.stale).toBe(true);
    expect(timestampOf("web_services")).toBe(writtenAt);
  });

  it("config: boots from its own cache flagged stale and leaves the entry untouched", async () => {
    setCachedData("config_/config", { orientation: "portrait" });
    const writtenAt = timestampOf("config_/config");
    vi.advanceTimersByTime(60 * 1000);
    replayEverything({ orientation: "landscape" });

    const store = useConfigStore();
    await store.fetchConfig();

    expect(store.orientation).toBe("portrait");
    expect(store.stale).toBe(true);
    expect(timestampOf("config_/config")).toBe(writtenAt);
  });

  it("flags the follow-up fetch stale too, once the replay marked the backend offline", async () => {
    setCachedData("calendar_sources", { sources: [{ id: "cached" }] });
    setCachedData("web_services", { services: [] });
    replayEverything({});

    await useCalendarStore().fetchSources();
    expect(connection.isBackendOnline).toBe(false);

    // The cache entry is well within its TTL, but it still isn't live data.
    const services = useWebServicesStore();
    await services.fetchServices();
    expect(services.stale).toBe(true);
  });
});
