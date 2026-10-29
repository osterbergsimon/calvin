/**
 * Fetch data for a schema-driven plugin renderer.
 *
 * Wraps useQuery with the conventional plugin data endpoint
 * (`/api/plugins/{serviceId}/data`) and the polling interval declared in the
 * schema. Renderers consume the returned reactive `data` and don't need to
 * know how it was fetched.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed, unref } from "vue";
import api, { isServiceWorkerReplay } from "@/services/api";

export function useSchemaData(serviceId, schema, enabled = true) {
  const id = computed(() => unref(serviceId));
  const isEnabled = computed(() => Boolean(unref(enabled)));
  const refetchInterval = computed(() => {
    const ms = unref(schema)?.poll_interval_ms;
    return typeof ms === "number" && ms > 0 ? ms : false;
  });
  const endpoint = computed(() => {
    const sid = id.value;
    return sid ? `/plugins/${sid}/data` : null;
  });

  const query = useQuery({
    queryKey: ["plugin-data", id],
    queryFn: async () => {
      if (!endpoint.value) return null;
      try {
        const response = await api.get(endpoint.value);
        return response.data;
      } catch (err) {
        // Offline: the service worker's last good payload beats a blank tile.
        if (isServiceWorkerReplay(err)) return err.response.data;
        throw err;
      }
    },
    enabled: computed(() => isEnabled.value && Boolean(endpoint.value)),
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    retry: 1,
  });

  return query;
}
