/**
 * Run a plugin's declared action from a schema renderer (homey switch tiles §3).
 *
 * Returns `(action: {name, params}) => Promise<object>`. SchemaRenderer hands it
 * to renderers as `runAction`, so renderers stay free of API code.
 *
 * After an answer, the returned item (`{item: {...}}`, the switch-grid
 * convention) is patched into the plugin's cached data, matched by `id`, so the
 * tile and the cache agree at once; the query is then invalidated either way,
 * so every tile ends on what the plugin reports. It does not use
 * useServiceDataRefresh, which would also reload the whole service list.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { toValue } from "vue";
import { runPluginAction } from "@/services/pluginsApi";

function patchItem(data, item) {
  if (!item || item.id === undefined || item.id === null) return data;
  const list = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(list)) return data;
  const index = list.findIndex(entry => entry && entry.id === item.id);
  if (index === -1) return data;
  const next = list.slice();
  next[index] = { ...list[index], ...item };
  return Array.isArray(data) ? next : { ...data, items: next };
}

export function usePluginAction(pluginId) {
  // The gallery and bare tests mount renderers with no QueryClient: then the
  // action still runs, only the cache steps are skipped.
  let queryClient = null;
  try {
    queryClient = useQueryClient();
  } catch {
    queryClient = null;
  }

  return async function runAction(action) {
    const id = toValue(pluginId);
    if (!id || typeof id !== "string") throw new Error("No plugin to run the action on");
    const key = ["plugin-data", id];
    try {
      const result = await runPluginAction(id, action.name, action.params || {});
      if (queryClient && result?.item) {
        queryClient.setQueryData(key, data => patchItem(data, result.item));
      }
      return result;
    } finally {
      queryClient?.invalidateQueries({ queryKey: key });
    }
  };
}
