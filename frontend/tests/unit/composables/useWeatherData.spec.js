/**
 * Unit tests for useWeatherData composable
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";
import { useWeatherData } from "@/composables/useWeatherData";
import { useConnectionStore } from "@/stores/connection";

// Mock stores
vi.mock("@/stores/connection", () => ({
  useConnectionStore: vi.fn(),
}));

// Mock cache utilities
vi.mock("@/utils/cache", () => ({
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  logInfo: vi.fn(),
}));

// Mock Vue Query
vi.mock("@tanstack/vue-query", () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from "@tanstack/vue-query";

describe("useWeatherData", () => {
  let mockConnectionStore;
  let mockQueryResult;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnectionStore = {
      isFullyOnline: vi.fn(() => true),
    };

    useConnectionStore.mockReturnValue(mockConnectionStore);

    mockQueryResult = {
      data: ref(null),
      isLoading: ref(false),
      isError: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    };

    // Reset mock implementation
    useQuery.mockImplementation((_options) => {
      return mockQueryResult;
    });
  });

  describe("Query configuration", () => {
    it("should configure query with correct key", () => {
      useWeatherData("weather-service-1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["weather", "weather-service-1"],
        }),
      );
    });

    it("should be disabled when serviceId is null", () => {
      useWeatherData(null, true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });

    it("should be disabled when enabled parameter is false", () => {
      useWeatherData("weather-service-1", false);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
    });

    it("should be enabled when serviceId and enabled are provided", () => {
      useWeatherData("weather-service-1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });
  });

  describe("Weather data functionality", () => {
    it("should return query result with weather data", () => {
      const mockWeatherData = {
        temperature: 20,
        condition: "sunny",
      };

      mockQueryResult.data.value = mockWeatherData;
      mockQueryResult.isLoading.value = false;

      useQuery.mockReturnValue(mockQueryResult);

      const result = useWeatherData("weather-service-1", true);

      // Test functionality: composable returns query result that can provide weather data
      expect(result).toBe(mockQueryResult);
      expect(result.data.value).toEqual(mockWeatherData);
      expect(result.isLoading.value).toBe(false);
    });

    it("should handle loading state", () => {
      mockQueryResult.isLoading.value = true;
      mockQueryResult.data.value = null;

      useQuery.mockReturnValue(mockQueryResult);

      const result = useWeatherData("weather-service-1", true);

      // Test functionality: loading state is tracked
      expect(result.isLoading.value).toBe(true);
    });

    it("should handle error state", () => {
      const error = new Error("Network error");
      mockQueryResult.isError.value = true;
      mockQueryResult.error.value = error;

      useQuery.mockReturnValue(mockQueryResult);

      const result = useWeatherData("weather-service-1", true);

      // Test functionality: error state is tracked
      expect(result.isError.value).toBe(true);
      expect(result.error.value).toEqual(error);
    });
  });

  describe("Query options", () => {
    it("should configure stale time", () => {
      useWeatherData("weather-service-1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          staleTime: 5 * 60 * 1000, // 5 minutes
        }),
      );
    });

    it("should configure garbage collection time", () => {
      useWeatherData("weather-service-1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          gcTime: 10 * 60 * 1000, // 10 minutes
        }),
      );
    });

    it("should configure refetch interval when online", () => {
      mockConnectionStore.isFullyOnline.mockReturnValue(true);

      useWeatherData("weather-service-1", true);

      const callArgs = useQuery.mock.calls[useQuery.mock.calls.length - 1][0];
      const refetchInterval = callArgs.refetchInterval({});

      expect(refetchInterval).toBe(10 * 60 * 1000); // 10 minutes
    });

    it("should disable refetch interval when offline", () => {
      mockConnectionStore.isFullyOnline.mockReturnValue(false);

      useWeatherData("weather-service-1", true);

      const callArgs = useQuery.mock.calls[useQuery.mock.calls.length - 1][0];
      const refetchInterval = callArgs.refetchInterval({});

      expect(refetchInterval).toBe(false);
    });

    it("should configure retry", () => {
      useWeatherData("weather-service-1", true);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: 1,
        }),
      );
    });
  });
});
