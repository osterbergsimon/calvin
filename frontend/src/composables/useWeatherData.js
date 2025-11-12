import { useQuery } from "@tanstack/vue-query";
import axios from "axios";

/**
 * Composable for fetching weather data using Vue Query.
 * Provides automatic caching, refetching, and error handling.
 */
export function useWeatherData(serviceId, enabled = true) {
  return useQuery({
    queryKey: ["weather", serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      
      const response = await axios.get(`/api/web-services/${serviceId}/weather`);
      return response.data;
    },
    enabled: enabled && !!serviceId,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 minutes
    refetchInterval: 10 * 60 * 1000, // Auto-refetch every 10 minutes
    retry: 1,
  });
}

