import { defineStore } from "pinia";
import { computed, ref } from "vue";
import api from "../services/api";
import { fetchWithCache } from "../utils/cache";
import { useConnectionStore } from "./connection";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";
import { friendlyError } from "../utils/friendlyError";

/**
 * Generated API types from backend OpenAPI snapshot.
 * Run `npm run gen:api` to refresh after backend route/schema changes.
 * @typedef {import("../api/types").components["schemas"]["PluginListResponse"]} PluginListResponse
 */

export const useWebServicesStore = defineStore("webServices", () => {
  const services = ref([]);
  // Service plugins that are turned off yet own instances that could run. Their
  // tiles are not loaded, so the screen editor lists them as "turned off" with a
  // way to switch them on instead of omitting them (calvin-zbcg). Filled by
  // loadDisabledPlugins(), only in Settings contexts: a kiosk cold load must not
  // pay one request per off plugin.
  const disabledPlugins = ref([]);
  // True once a services list (live or cached) has been applied, so "no tile
  // with that id" can be told apart from "not loaded yet".
  const hasLoaded = ref(false);
  const loaded = computed(() => hasLoaded.value || services.value.length > 0);
  const currentServiceIndex = ref(0);
  const loading = ref(false);
  const error = ref(null);
  // One friendly sentence for the screen; `error` keeps the raw text for logs.
  const errorText = ref("");
  // True while the shown services came from the offline cache.
  const stale = ref(false);

  const applyServices = responseData => {
    const allServices = responseData?.services || [];
    hasLoaded.value = true;
    services.value = allServices.filter(s => s.enabled);
    // Sort by display_order
    services.value.sort((a, b) => a.display_order - b.display_order);
    // Reset current index if out of bounds
    if (currentServiceIndex.value >= services.value.length) {
      currentServiceIndex.value = 0;
    }
  };

  // Load every enabled service plugin's instances. `complete` is false when a
  // plugin's details or instances could not be loaded, so the caller can keep
  // that partial list out of the offline cache.
  const loadServices = async () => {
    // Only service-type plugins are inspected here, so statusbar_schema is currently
    // surfaced (in the bar and in Dashboard › Clock) only for service plugins. Other
    // plugin types may declare statusbar_schema in their metadata but won't render or
    // appear in the toggle UI until this fetch is broadened.
    const response = await api.get("/plugins", {
      params: { plugin_type: "service" },
    });
    /** @type {PluginListResponse} */
    const pluginsResponseData = response.data;
    const plugins = pluginsResponseData.plugins || [];

    // Get instances for each service plugin
    const allInstances = [];
    let complete = true;
    for (const plugin of plugins) {
      if (plugin.enabled) {
        try {
          // Get plugin details to access display_schema
          const pluginDetailsResponse = await api.get(`/plugins/${plugin.id}`);
          const pluginDetails = pluginDetailsResponse.data;
          logDebug(`[WebServicesStore] Plugin details for ${plugin.id}:`, {
            id: pluginDetails.id,
            name: pluginDetails.name,
            display_schema: pluginDetails.display_schema,
          });

          const instancesResponse = await api.get(`/plugins/${plugin.id}/instances`);
          const instances = instancesResponse.data.instances || [];
          // Add plugin info and display_schema to each instance
          instances.forEach(instance => {
            // Use plugin's display_schema (from plugin metadata) as it's the source of truth
            const displaySchema = pluginDetails.display_schema || instance.display_schema;
            logDebug(`[WebServicesStore] Instance ${instance.id} display_schema:`, displaySchema);
            allInstances.push({
              ...instance,
              plugin_id: plugin.id,
              plugin_name: plugin.name,
              display_schema: displaySchema,
              statusbar_schema: pluginDetails.statusbar_schema || null,
              type_id: plugin.id,
            });
          });
        } catch (err) {
          complete = false;
          logWarn("[WebServicesStore]", `Failed to get instances for ${plugin.id}:`, err);
        }
      }
    }

    // Format as services for compatibility
    // Need to preserve both old format (url) and new format (config.url)
    const responseData = {
      services: allInstances.map(instance => ({
        id: instance.id,
        name: instance.name,
        url: instance.config?.url || instance.url || "", // Support both formats
        config: instance.config || {}, // Preserve full config
        enabled: instance.enabled !== false,
        display_order: instance.display_order || 0,
        fullscreen: instance.config?.fullscreen || false,
        plugin_id: instance.plugin_id,
        plugin_name: instance.plugin_name,
        display_schema: instance.display_schema || instance.config?.display_schema,
        statusbar_schema: instance.statusbar_schema || null,
      })),
    };
    return { responseData, complete };
  };

  const loadDisabledPlugins = async () => {
    try {
      const response = await api.get("/plugins", { params: { plugin_type: "service" } });
      const off = (response.data?.plugins || []).filter(plugin => !plugin.enabled);
      const found = await Promise.all(
        off.map(async plugin => {
          try {
            const instances = (await api.get(`/plugins/${plugin.id}/instances`)).data.instances;
            // Offering a turn-on that would leave nothing to pick helps nobody.
            const runnable = (instances || []).some(instance => instance.enabled !== false);
            return runnable
              ? { id: plugin.id, name: plugin.name, reason: plugin.error_message || "" }
              : null;
          } catch (err) {
            logWarn("[WebServicesStore]", `Failed to check instances of ${plugin.id}:`, err);
            return null;
          }
        })
      );
      disabledPlugins.value = found.filter(Boolean);
    } catch (err) {
      logWarn("[WebServicesStore]", "Failed to list turned-off plugins:", err);
    }
  };

  // "Turn on" from the screen editor. `toggle` is usePlugins().togglePlugin. The
  // lists are refreshed whatever happens, and the outcome is told plainly:
  // a refusal (sealed mode, 403) or a partial start is a message, not silence.
  const turnOnPlugin = async (pluginId, toggle) => {
    let outcome = { ok: true, message: "" };
    try {
      const result = await toggle(pluginId, true);
      if (result?.failed > 0) {
        const total = result.started + result.failed;
        outcome = {
          ok: false,
          message: `Turned on, but ${result.failed} of ${total} sources did not start.`,
        };
      }
    } catch (err) {
      outcome = {
        ok: false,
        message:
          // A plain-text detail (sealed mode, a 403) is the reason; a structured one
          // (the 401 sign-in object) is not text, so use the standard sentence.
          typeof err?.response?.data?.detail === "string" && err.response.data.detail
            ? err.response.data.detail
            : friendlyError(err, "turn this plugin on"),
      };
    }
    await Promise.allSettled([fetchServices(), loadDisabledPlugins()]);
    return outcome;
  };

  const clearError = () => {
    error.value = null;
    errorText.value = "";
  };

  const captureError = (err, action, message) => {
    error.value = err.message;
    errorText.value = friendlyError(err, action);
    logError("[WebServicesStore]", message, err);
  };

  const fetchServices = async () => {
    loading.value = true;
    clearError();

    const connectionStore = useConnectionStore();
    const cacheKey = "web_services";
    const cacheTTL = 5 * 60 * 1000; // 5 minutes

    try {
      let complete = true;
      const result = await fetchWithCache(
        cacheKey,
        cacheTTL,
        async () => {
          const loaded = await loadServices();
          complete = loaded.complete;
          return loaded.responseData;
        },
        { preferCache: !connectionStore.isFullyOnline(), shouldCache: () => complete }
      );
      if (result.fromCache) {
        logInfo("[WebServicesStore]", `Using ${result.stale ? "stale " : ""}cached services`);
      }
      logDebug(
        "[WebServicesStore] All services:",
        (result.data?.services || []).map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))
      );
      applyServices(result.data);
      stale.value = result.stale;
      return result.data;
    } catch (err) {
      captureError(err, "load your sources", "Failed to fetch web services:");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // "Add web service" creates an instance of the host's built-in iframe
  // plugin — a deliberate host-owned constant, not plugin sniffing.
  const WEB_EMBED_PLUGIN_ID = "iframe";

  const addService = async service => {
    try {
      const response = await api.post(`/plugins/${WEB_EMBED_PLUGIN_ID}/instances`, {
        name: service.name,
        config: {
          url: service.url,
          fullscreen: service.fullscreen || false,
          display_order: service.display_order || 0,
        },
        enabled: service.enabled !== false,
      });
      await fetchServices();
      return response.data;
    } catch (err) {
      captureError(err, "add that page", "Failed to add web service:");
      throw err;
    }
  };

  const updateService = async (serviceId, updates) => {
    try {
      // Update using plugin instance API
      const response = await api.put(`/plugins/instances/${serviceId}`, {
        name: updates.name,
        config: {
          url: updates.url,
          fullscreen: updates.fullscreen || false,
          display_order: updates.display_order || 0,
        },
        enabled: updates.enabled !== undefined ? updates.enabled : true,
      });
      await fetchServices();
      return response.data;
    } catch (err) {
      captureError(err, "save that page", "Failed to update web service:");
      throw err;
    }
  };

  const removeService = async serviceId => {
    try {
      // Delete using plugin instance API
      await api.delete(`/plugins/instances/${serviceId}`);
      await fetchServices();
    } catch (err) {
      captureError(err, "remove that page", "Failed to remove web service:");
      throw err;
    }
  };

  const getCurrentService = () => {
    if (services.value.length === 0) return null;
    return services.value[currentServiceIndex.value] || null;
  };

  const getServiceById = serviceId => {
    if (!serviceId) return getCurrentService();
    return services.value.find(service => service.id === serviceId) || null;
  };

  const nextService = () => {
    if (services.value.length === 0) return;
    currentServiceIndex.value = (currentServiceIndex.value + 1) % services.value.length;
  };

  const previousService = () => {
    if (services.value.length === 0) return;
    currentServiceIndex.value =
      currentServiceIndex.value === 0 ? services.value.length - 1 : currentServiceIndex.value - 1;
  };

  const setServiceIndex = index => {
    if (index >= 0 && index < services.value.length) {
      currentServiceIndex.value = index;
    }
  };

  const refreshCurrentService = async () => {
    /** Refresh the current service's data by refetching services. */
    try {
      // Clear cache and refetch services
      const _cacheKey = "web_services";
      // Clear from cache utility if it has a clear method
      // For now, just refetch which will overwrite cache
      await fetchServices();
      logInfo("[WebServices]", "Current service refreshed");
    } catch (err) {
      captureError(err, "refresh this page", "Failed to refresh current service:");
      throw err;
    }
  };

  return {
    services,
    disabledPlugins,
    loadDisabledPlugins,
    turnOnPlugin,
    loaded,
    currentServiceIndex,
    loading,
    error,
    errorText,
    stale,
    fetchServices,
    addService,
    updateService,
    removeService,
    getCurrentService,
    getServiceById,
    nextService,
    previousService,
    setServiceIndex,
    refreshCurrentService,
  };
});
