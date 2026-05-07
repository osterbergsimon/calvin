import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "../utils/cache";
import { useConnectionStore } from "./connection";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";

/**
 * Generated API types from backend OpenAPI snapshot.
 * Run `npm run gen:api` to refresh after backend route/schema changes.
 * @typedef {import("../api/types").components["schemas"]["PluginListResponse"]} PluginListResponse
 */

export const useWebServicesStore = defineStore("webServices", () => {
  const services = ref([]);
  const currentServiceIndex = ref(0);
  const loading = ref(false);
  const error = ref(null);

  const fetchServices = async () => {
    loading.value = true;
    error.value = null;

    const connectionStore = useConnectionStore();
    const cacheKey = "web_services";
    const cacheTTL = 5 * 60 * 1000; // 5 minutes

    // Try to load from cache first if offline
    if (!connectionStore.isFullyOnline()) {
      const cachedServices = getCachedData(cacheKey, cacheTTL);
      if (cachedServices) {
        logInfo("[WebServicesStore]", "Using cached services");
        const allServices = cachedServices.services || [];
        services.value = allServices.filter(s => s.enabled);
        services.value.sort((a, b) => a.display_order - b.display_order);
        if (currentServiceIndex.value >= services.value.length) {
          currentServiceIndex.value = 0;
        }
        loading.value = false;
        return cachedServices;
      }
    }

    try {
      // Use plugin API to get service plugin instances
      const response = await axios.get("/api/plugins", {
        params: { plugin_type: "service" },
      });
      /** @type {PluginListResponse} */
      const pluginsResponseData = response.data;
      const plugins = pluginsResponseData.plugins || [];

      // Get instances for each service plugin
      const allInstances = [];
      for (const plugin of plugins) {
        if (plugin.enabled) {
          try {
            // Get plugin details to access display_schema
            const pluginDetailsResponse = await axios.get(`/api/plugins/${plugin.id}`);
            const pluginDetails = pluginDetailsResponse.data;
            logDebug(`[WebServicesStore] Plugin details for ${plugin.id}:`, {
              id: pluginDetails.id,
              name: pluginDetails.name,
              display_schema: pluginDetails.display_schema,
            });

            const instancesResponse = await axios.get(`/api/plugins/${plugin.id}/instances`);
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
            // Plugin might not have instances endpoint, skip
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

      const allServices = responseData.services || [];
      logDebug(
        "[WebServicesStore] All services from API:",
        allServices.map(s => ({
          id: s.id,
          name: s.name,
          enabled: s.enabled,
        }))
      );
      services.value = allServices.filter(s => s.enabled);
      logDebug(
        "[WebServicesStore] Enabled services:",
        services.value.map(s => ({ id: s.id, name: s.name }))
      );
      // Sort by display_order
      services.value.sort((a, b) => a.display_order - b.display_order);
      // Reset current index if out of bounds
      if (currentServiceIndex.value >= services.value.length) {
        currentServiceIndex.value = 0;
      }

      // Cache the response
      setCachedData(cacheKey, responseData);

      return responseData;
    } catch (err) {
      // If online but request failed, try cache
      if (connectionStore.isFullyOnline()) {
        const cachedServices = getCachedData(cacheKey, cacheTTL);
        if (cachedServices) {
          logInfo("[WebServicesStore]", "Request failed, using cached services");
          const allServices = cachedServices.services || [];
          services.value = allServices.filter(s => s.enabled);
          services.value.sort((a, b) => a.display_order - b.display_order);
          if (currentServiceIndex.value >= services.value.length) {
            currentServiceIndex.value = 0;
          }
          loading.value = false;
          return cachedServices;
        }
      }

      error.value = err.message;
      logError("[WebServicesStore]", "Failed to fetch web services:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const addService = async service => {
    try {
      // Web services are now plugin instances
      // Find the iframe service plugin (or use a default)
      const pluginsResponse = await axios.get("/api/plugins", {
        params: { plugin_type: "service" },
      });
      const servicePlugins = pluginsResponse.data.plugins || [];
      // Find iframe plugin or use first service plugin
      const iframePlugin = servicePlugins.find(p => p.id === "iframe") || servicePlugins[0];

      if (!iframePlugin) {
        throw new Error("No service plugin available");
      }

      // Create instance using plugin API
      const response = await axios.post(`/api/plugins/${iframePlugin.id}/instances`, {
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
      error.value = err.message;
      logError("[WebServicesStore]", "Failed to add web service:", err);
      throw err;
    }
  };

  const updateService = async (serviceId, updates) => {
    try {
      // Update using plugin instance API
      const response = await axios.put(`/api/plugins/instances/${serviceId}`, {
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
      error.value = err.message;
      logError("[WebServicesStore]", "Failed to update web service:", err);
      throw err;
    }
  };

  const removeService = async serviceId => {
    try {
      // Delete using plugin instance API
      await axios.delete(`/api/plugins/instances/${serviceId}`);
      await fetchServices();
    } catch (err) {
      error.value = err.message;
      logError("[WebServicesStore]", "Failed to remove web service:", err);
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
      error.value = err.message;
      logError("[WebServices]", "Failed to refresh current service:", err);
      throw err;
    }
  };

  return {
    services,
    currentServiceIndex,
    loading,
    error,
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
