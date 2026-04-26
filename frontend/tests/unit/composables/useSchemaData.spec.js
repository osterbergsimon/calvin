import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSchemaData } from "@/composables/useSchemaData";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/vue-query";

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
});
