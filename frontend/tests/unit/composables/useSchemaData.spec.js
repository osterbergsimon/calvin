import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useSchemaData } from "@/composables/useSchemaData";
import { APP_FRAME, useProgressStore } from "@/stores/progress";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
  },
  isServiceWorkerReplay: err => Boolean(err?.serviceWorkerReplay),
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/vue-query";
import api from "@/services/api";

describe("useSchemaData", () => {
  const mockQueryResult = {
    data: ref(null),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useQuery.mockReturnValue(mockQueryResult);
  });

  const lastCallOptions = () => useQuery.mock.calls[useQuery.mock.calls.length - 1][0];

  it("enables the query when service id and enabled flag are truthy", () => {
    useSchemaData("weather-1", { kind: "status-tile" }, true);

    expect(lastCallOptions().enabled.value).toBe(true);
  });

  it("disables the query when service id is missing", () => {
    useSchemaData(null, { kind: "status-tile" }, true);

    expect(lastCallOptions().enabled.value).toBe(false);
  });

  it("disables the query when the enabled flag is false", () => {
    useSchemaData("legacy-service", {}, false);

    expect(lastCallOptions().enabled.value).toBe(false);
  });

  it("uses schema polling interval when provided", () => {
    useSchemaData("weather-1", { poll_interval_ms: 30000 }, true);

    expect(lastCallOptions().refetchInterval.value).toBe(30000);
  });

  it("keeps showing the service worker's replayed payload when offline", async () => {
    api.get.mockRejectedValue({ serviceWorkerReplay: true, response: { data: { temp: 7 } } });
    useSchemaData("weather-1", {}, true);

    await expect(lastCallOptions().queryFn()).resolves.toEqual({ temp: 7 });
  });

  it("still fails on a real error", async () => {
    api.get.mockRejectedValue(new Error("Network Error"));
    useSchemaData("weather-1", {}, true);

    await expect(lastCallOptions().queryFn()).rejects.toThrow("Network Error");
  });

  // CLV-115: plugin data fetches, first load and poll refetches alike, drive
  // the loading light (docs/design/2026-11-01-loading-light.md §2).
  describe("loading light", () => {
    let isFetching;
    let scope;
    let progress;

    beforeEach(() => {
      vi.useFakeTimers();
      isFetching = ref(false);
      useQuery.mockReturnValue({ ...mockQueryResult, isFetching });
      progress = useProgressStore();
      scope = effectScope();
    });

    afterEach(() => {
      scope.stop();
      vi.useRealTimers();
    });

    const run = (...args) => scope.run(() => useSchemaData(...args));

    it("lights the region frame while a region payload is fetching", () => {
      run("weather-1", {}, true, { regionId: "r1" });
      isFetching.value = true;
      vi.advanceTimersByTime(400);
      expect(progress.isFrameVisible("r1")).toBe(true);
      expect(progress.appVisible).toBe(false);
      isFetching.value = false;
      expect(progress.active).toBe(false);
    });

    it("lights again on a poll refetch", () => {
      run("weather-1", { poll_interval_ms: 30000 }, true, { regionId: "r1" });
      isFetching.value = true;
      isFetching.value = false;
      expect(progress.active).toBe(false);
      // The next poll tick refetches in the background.
      isFetching.value = true;
      expect(progress.active).toBe(true);
      vi.advanceTimersByTime(400);
      expect(progress.isFrameVisible("r1")).toBe(true);
      isFetching.value = false;
      expect(progress.active).toBe(false);
    });

    it("a status item without a region lights the app frame", () => {
      run("weather-1", { kind: "text" }, true);
      isFetching.value = true;
      vi.advanceTimersByTime(400);
      expect(progress.isFrameVisible(APP_FRAME)).toBe(true);
    });

    it("ends its source when the component goes away mid-fetch", () => {
      run("weather-1", {}, true, { regionId: "r1" });
      isFetching.value = true;
      expect(progress.active).toBe(true);
      scope.stop();
      expect(progress.active).toBe(false);
    });

    it("two tiles fetching the same plugin each hold their own source", () => {
      const other = ref(false);
      run("weather-1", {}, true, { regionId: "r1" });
      useQuery.mockReturnValue({ ...mockQueryResult, isFetching: other });
      run("weather-1", {}, true, { regionId: "r1" });
      isFetching.value = true;
      other.value = true;
      isFetching.value = false;
      expect(progress.active).toBe(true);
      other.value = false;
      expect(progress.active).toBe(false);
    });
  });
});
