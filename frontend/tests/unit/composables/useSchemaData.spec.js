import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSchemaData } from "@/composables/useSchemaData";

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
});
