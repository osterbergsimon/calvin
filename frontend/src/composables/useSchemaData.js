/**
 * Fetch data for a schema-driven plugin renderer.
 *
 * Wraps useQuery with the conventional plugin data endpoint
 * (`/api/plugins/{serviceId}/data`) and the polling interval declared in the
 * schema. Renderers consume the returned reactive `data` and don't need to
 * know how it was fetched.
 */
import { useQuery } from "@tanstack/vue-query";
import axios from "axios";
import { computed, unref } from "vue";

export function useSchemaData(serviceId, schema) {
  const id = computed(() => unref(serviceId));
  const refetchInterval = computed(() => {
    const ms = unref(schema)?.poll_interval_ms;
    return typeof ms === "number" && ms > 0 ? ms : false;
  });
  const endpoint = computed(() => {
    const sid = id.value;
    return sid ? `/api/plugins/${sid}/data` : null;
  });

  const query = useQuery({
    queryKey: ["plugin-data", id],
    queryFn: async () => {
      if (!endpoint.value) return null;
      const response = await axios.get(endpoint.value);
      return response.data;
    },
    enabled: computed(() => Boolean(endpoint.value)),
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    retry: 1,
  });

  return query;
}
