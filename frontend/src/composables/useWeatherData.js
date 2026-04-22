import { computed, unref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import axios from "axios";
import { getCachedData, setCachedData } from "../utils/cache";
import { useConnectionStore } from "../stores/connection";
import { logInfo } from "../utils/logger";

const cacheTTL = 10 * 60 * 1000;

/**
 * Composable for fetching weather data using Vue Query.
 * Provides automatic caching, refetching, and error handling.
 * Falls back to localStorage cache when offline.
 *
 * serviceId and enabled may be plain values OR reactive refs/computed.
 */
export function useWeatherData(serviceId, enabled = true) {
  const connectionStore = useConnectionStore();

  // Unwrap refs at call time so template literals receive strings, not objects
  const getId = () => unref(serviceId);

  return useQuery({
    queryKey: computed(() => ["weather", getId()]),
    queryFn: async () => {
      const id = getId();
      if (!id) return null;

      const cacheKey = `weather_${id}`;

      // Try cache first if offline
      if (!connectionStore.isFullyOnline()) {
        const cachedData = getCachedData(cacheKey, cacheTTL);
        if (cachedData) {
          logInfo("[Weather]", `Using cached data for ${id}`);
          return cachedData;
        }
      }

      try {
        const response = await axios.get(`/api/plugins/${id}/data`);
        const data = response.data;
        setCachedData(cacheKey, data);
        return data;
      } catch (error) {
        const cachedData = getCachedData(cacheKey, cacheTTL);
        if (cachedData) {
          logInfo("[Weather]", `Request failed, using cached data for ${id}`);
          return cachedData;
        }
        throw error;
      }
    },
    enabled: computed(() => !!unref(enabled) && !!getId()),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: (_query) => {
      return connectionStore.isFullyOnline() ? 10 * 60 * 1000 : false;
    },
    retry: 1,
  });
}
