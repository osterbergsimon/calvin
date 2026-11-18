/**
 * Run a plugin's declared action from a schema renderer (homey switch tiles §3).
 *
 * Returns `(action: {name, params}) => Promise<object>`. SchemaRenderer hands it
 * to renderers as `runAction`, so renderers stay free of API code.
 *
 * After an answer, the returned item (`{item: {...}}`, the switch-grid
 * convention) is patched into the plugin's cached data, matched by `id`, so the
 * tile and the cache agree at once (at the schema's `data_path`, default
 * `$.items`; the answered item must carry its new `action`); the query is then invalidated either way,
 * so every tile ends on what the plugin reports. It does not use
 * useServiceDataRefresh, which would also reload the whole service list.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { toValue } from "vue";
import { runPluginAction } from "@/services/pluginsApi";
import { resolvePath } from "@/utils/jsonPath";

// Path segments the way resolvePath reads them ("$.devices", "$.a.items[0].b").
function pathSegments(path) {
  const expr = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  const segments = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(expr)) !== null) segments.push(m[1] !== undefined ? m[1] : Number(m[2]));
  return segments;
}

// Copy `data` with the value at `segments` replaced; containers on the way are
// copied, never mutated (the cache's previous value must stay untouched).
function withValueAt(data, segments, value) {
  if (!segments.length) return value;
  const [head, ...rest] = segments;
  const copy = Array.isArray(data) ? data.slice() : { ...data };
  copy[head] = withValueAt(data[head], rest, value);
  return copy;
}

// The answered item takes its list entry's place. Fields it omits (label,
// group) are kept so the tile stays, but `action` is not: its params were built
// for the old state, so without a new one the tile stays inert until the
// refetch brings the plugin's own.
function patchItem(data, item, dataPath) {
  if (!item || item.id === undefined || item.id === null) return data;
  const path = dataPath || "$.items";
  const list = resolvePath(data, path);
  if (!Array.isArray(list)) return data;
  const index = list.findIndex(entry => entry && entry.id === item.id);
  if (index === -1) return data;
  const next = list.slice();
  const { action: _stale, ...kept } = list[index];
  next[index] = { ...kept, ...item };
  return withValueAt(data, pathSegments(path), next);
}

export function usePluginAction(pluginId, dataPath = null) {
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
        queryClient.setQueryData(key, data => patchItem(data, result.item, toValue(dataPath)));
      }
      return result;
    } finally {
      queryClient?.invalidateQueries({ queryKey: key });
    }
  };
}
