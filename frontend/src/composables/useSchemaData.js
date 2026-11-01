/**
 * Fetch data for a schema-driven plugin renderer.
 *
 * Wraps useQuery with the conventional plugin data endpoint
 * (`/api/plugins/{serviceId}/data`) and the polling interval declared in the
 * schema. Renderers consume the returned reactive `data` and don't need to
 * know how it was fetched.
 *
 * Every fetch, first load and poll refetch alike, drives the loading light
 * (CLV-115): on `regionId`'s frame when the data belongs to a region, else on
 * the app frame (clock-bar and status items).
 */
import { useQuery } from "@tanstack/vue-query";
import { computed, getCurrentScope, onScopeDispose, unref, watch } from "vue";
import api, { isServiceWorkerReplay } from "@/services/api";
import { useProgressStore } from "@/stores/progress";

let lightSeq = 0;

export function useSchemaData(serviceId, schema, enabled = true, { regionId = null } = {}) {
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

  trackFetching(query, id, regionId);

  return query;
}

// One light source per caller, so two tiles sharing a query key each hold
// their own and one finishing never cuts the other's light short.
function trackFetching(query, id, regionId) {
  if (!query?.isFetching) return;
  const progress = useProgressStore();
  lightSeq += 1;
  const seq = lightSeq;
  let sourceId = null;

  const stop = () => {
    if (sourceId) progress.end(sourceId);
    sourceId = null;
  };

  watch(
    () => Boolean(unref(query.isFetching)),
    fetching => {
      if (!fetching) return stop();
      if (sourceId) return;
      sourceId = `plugin-data:${id.value}#${seq}`;
      progress.begin(sourceId, { regionId: unref(regionId) || null });
    },
    { immediate: true, flush: "sync" }
  );

  if (getCurrentScope()) onScopeDispose(stop);
}
