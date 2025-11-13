import { useQuery } from "@tanstack/vue-query";
import axios from "axios";
import { getCachedData, setCachedData } from "../utils/cache";
import { useConnectionStore } from "../stores/connection";

/**
 * Composable for fetching weather data using Vue Query.
 * Provides automatic caching, refetching, and error handling.
 * Falls back to localStorage cache when offline.
 */
export function useWeatherData(serviceId, enabled = true) {
  const connectionStore = useConnectionStore();
  const cacheKey = `weather_${serviceId}`;
  const cacheTTL = 10 * 60 * 1000; // 10 minutes

  return useQuery({
    queryKey: ["weather", serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      
      // Try cache first if offline
      if (!connectionStore.isFullyOnline()) {
        const cachedData = getCachedData(cacheKey, cacheTTL);
        if (cachedData) {
          console.log(`[Weather] Using cached data for ${serviceId}`);
          return cachedData;
        }
      }
      
      try {
        const response = await axios.get(`/api/web-services/${serviceId}/weather`);
        const data = response.data;
        
        // Cache the response
        setCachedData(cacheKey, data);
        
        return data;
      } catch (error) {
        // If request failed, try cache
        const cachedData = getCachedData(cacheKey, cacheTTL);
        if (cachedData) {
          console.log(`[Weather] Request failed, using cached data for ${serviceId}`);
          return cachedData;
        }
        throw error;
      }
    },
    enabled: enabled && !!serviceId,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchInterval: (query) => {
      // Only refetch when online
      return connectionStore.isFullyOnline() ? 10 * 60 * 1000 : false;
    },
    retry: 1,
  });
}

