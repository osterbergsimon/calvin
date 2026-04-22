/**
 * Composable for plugin management.
 * Uses singleton pattern to ensure state is shared across all components.
 */

import { ref, computed } from "vue";
import * as pluginsApi from "../services/pluginsApi";
import { logError, logWarn } from "../utils/logger";

// Shared state (singleton pattern)
const plugins = ref([]);
const pluginInstances = ref({});
const pluginConfigs = ref({});
const pluginDisplayOrders = ref({});
const imagePluginDisplayOrders = ref({});
const loadingPlugins = ref(false);
const installingPlugin = ref(false);
const enumeratingPlugins = ref(false);
const selectedPluginZip = ref(null);
const githubRepoUrl = ref("");
const githubBranch = ref("main");
const availablePlugins = ref([]);
const pluginInstallError = ref("");
const pluginInstallSuccess = ref("");
const pluginRequiresRestart = ref(false);
const pluginBranchSwitched = ref(false);
const pluginActualBranch = ref("");
const pluginFrontendRebuildTriggered = ref(false);
const expandedPlugins = ref({});
const pluginFormData = ref({});
const savingPlugin = ref(null);
const testingPlugin = ref({});
const fetchingPlugin = ref({});
const pluginSaveStatus = ref({});
const pluginTestStatus = ref({});
const pluginFetchStatus = ref({});

// Computed properties (using shared refs)
const imagePlugins = computed(() => {
  return plugins.value.filter((p) => p.type === "image" && p.enabled);
});

const sortedPluginCategories = computed(() => {
  const categories = [
    { type: "calendar", label: "Calendar", plugins: [] },
    { type: "image", label: "Image", plugins: [] },
    { type: "service", label: "Service", plugins: [] },
    { type: "backend", label: "Backend", plugins: [] },
    { type: "theme", label: "Theme", plugins: [] },
  ];

  plugins.value.forEach((plugin) => {
    const category = categories.find((c) => c.type === plugin.type);
    if (category) {
      category.plugins.push(plugin);
    }
  });

  return categories.filter((c) => c.plugins.length > 0);
});

export function usePlugins() {
  // Load plugins
  const loadPlugins = async () => {
    loadingPlugins.value = true;
    try {
      const [pluginsResponse, installedResponse] = await Promise.all([
        pluginsApi.getPlugins(),
        pluginsApi.getInstalledPlugins().catch((error) => {
          // Silently handle 404 for installed plugins endpoint
          if (error.response?.status === 404) {
            return { plugins: [] };
          }
          logWarn("[usePlugins]", "Failed to load installed plugins:", error);
          return { plugins: [] };
        }),
      ]);

      const allPlugins = pluginsResponse.plugins || [];
      const installedIds = new Set(
        (installedResponse.plugins || []).map((p) => p.id),
      );

      // Mark installed plugins
      plugins.value = allPlugins.map((plugin) => ({
        ...plugin,
        _installed: installedIds.has(plugin.id),
      }));

      // Load instances and configs for each plugin
      for (const plugin of plugins.value) {
        try {
          // Skip config loading for themes (they don't have configs)
          if (plugin.type === "theme") {
            pluginInstances.value[plugin.id] = [];
            pluginConfigs.value[plugin.id] = {};
            continue;
          }

          // Get display_order from plugin's common_config_schema first (from plugin list)
          // This is the source of truth and avoids needing to fetch config separately
          const pluginSchema = plugin.common_config_schema || {};
          let displayOrder = pluginSchema.display_order;

          const [instancesResponse, configResponse] = await Promise.all([
            pluginsApi
              .getPluginInstances(plugin.id)
              .catch(() => ({ instances: [] })),
            pluginsApi.getPluginConfig(plugin.id).catch(() => ({ config: {} })),
          ]);

          pluginInstances.value[plugin.id] = instancesResponse.instances || [];
          pluginConfigs.value[plugin.id] = configResponse.config || {};

          // Load display orders from config (fallback to config API if not in schema)
          const config = configResponse.config || {};
          // Use config API value only if schema doesn't have it
          if (displayOrder === undefined || displayOrder === null) {
            displayOrder = config.display_order;
          }

          // Handle display_order being an object (from schema with type/description)
          if (typeof displayOrder === "object" && displayOrder !== null) {
            displayOrder = displayOrder.value || displayOrder.default || "0";
          }

          // Parse and set display order
          let parsedOrder = parseInt(String(displayOrder || "0"), 10);
          // Handle NaN case
          if (isNaN(parsedOrder)) {
            logWarn(
              "[usePlugins]",
              `Invalid display_order for ${plugin.id}: ${displayOrder}, defaulting to 0`,
            );
            parsedOrder = 0;
          }

          if (plugin.type === "service") {
            pluginDisplayOrders.value[plugin.id] = parsedOrder;
          } else if (plugin.type === "image") {
            imagePluginDisplayOrders.value[plugin.id] = parsedOrder;
          }
        } catch (error) {
          logError(
            "[usePlugins]",
            `Failed to load data for plugin ${plugin.id}:`,
            error,
          );
          pluginInstances.value[plugin.id] = [];
          pluginConfigs.value[plugin.id] = {};
        }
      }
    } catch (error) {
      logError("[usePlugins]", "Failed to load plugins:", error);
      plugins.value = [];
    } finally {
      loadingPlugins.value = false;
    }
  };

  // Install plugin from zip
  const installPluginFromZip = async (file) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;

    try {
      const response = await pluginsApi.installPluginFromZip(file);
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      if (response.frontend_rebuild_triggered) {
        pluginFrontendRebuildTriggered.value = true;
      }

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
        }, 5000);
      }

      await loadPlugins();
    } catch (error) {
      pluginInstallError.value =
        error.response?.data?.detail ||
        error.message ||
        "Failed to install plugin";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Enumerate plugins from GitHub
  const enumeratePluginsFromGitHub = async (repoUrl, branch = "main") => {
    if (!repoUrl || !repoUrl.trim()) {
      pluginInstallError.value = "Repository URL is required";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
      return;
    }

    enumeratingPlugins.value = true;
    availablePlugins.value = [];
    pluginBranchSwitched.value = false;
    pluginActualBranch.value = "";

    try {
      const response = await pluginsApi.enumeratePluginsFromGitHub(
        repoUrl,
        branch,
      );
      const enumeratedPlugins = response.plugins || [];
      const enumeratedThemes = response.themes || [];

      // Merge themes into plugins array (themes are also plugins for installation purposes)
      const allItems = [
        ...enumeratedPlugins,
        ...enumeratedThemes.map((theme) => ({
          ...theme,
          type: "theme", // Ensure type is set to theme
        })),
      ];

      // Get installed plugins to compare versions
      let installedPluginsMap = {};
      try {
        const installedResponse = await pluginsApi.getInstalledPlugins();
        const installed = installedResponse.plugins || [];
        installedPluginsMap = Object.fromEntries(
          installed.map((p) => [p.id, p]),
        );
      } catch (error) {
        // Silently handle 404 for installed plugins endpoint
        if (error.response?.status !== 404) {
          logWarn(
            "[usePlugins]",
            "Failed to load installed plugins for comparison:",
            error,
          );
        }
      }

      // Mark installed plugins and add version info
      availablePlugins.value = allItems.map((plugin) => {
        const installed = installedPluginsMap[plugin.id];
        if (installed) {
          return {
            ...plugin,
            _installed: true,
            _installedVersion: installed.version || null,
          };
        }
        return {
          ...plugin,
          _installed: false,
          _installedVersion: null,
        };
      });

      pluginBranchSwitched.value = response.branch_switched || false;
      pluginActualBranch.value = response.branch || branch;
    } catch (error) {
      logError(
        "[usePlugins]",
        "Failed to enumerate plugins from GitHub:",
        error,
      );
      pluginInstallError.value =
        error.response?.data?.detail ||
        error.message ||
        "Failed to enumerate plugins from GitHub";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      enumeratingPlugins.value = false;
    }
  };

  // Install plugin from GitHub
  const installPluginFromGitHub = async (
    repoUrl,
    pluginPath,
    branch = "main",
    force = false,
  ) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;
    pluginBranchSwitched.value = false;
    pluginActualBranch.value = "";

    try {
      const response = await pluginsApi.installPluginFromGitHub(
        repoUrl,
        pluginPath,
        branch,
        force,
      );
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      pluginBranchSwitched.value = response.branch_switched || false;
      pluginActualBranch.value = response.branch || branch;
      if (response.frontend_rebuild_triggered) {
        pluginFrontendRebuildTriggered.value = true;
      }

      availablePlugins.value = [];
      await loadPlugins();

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
        }, 5000);
      }
    } catch (error) {
      const errorDetail = error.response?.data?.detail || error.message || "";
      if (
        errorDetail.includes("older than") ||
        errorDetail.includes("version")
      ) {
        pluginInstallError.value = errorDetail;
      } else {
        pluginInstallError.value =
          errorDetail || "Failed to install plugin from GitHub";
      }
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Install multiple plugins from GitHub
  const installPluginsFromGitHub = async (
    plugins,
    repoUrl,
    branch = "main",
  ) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;
    pluginBranchSwitched.value = false;
    pluginActualBranch.value = "";

    const results = {
      success: [],
      failed: [],
      requiresRestart: false,
    };

    try {
      for (const plugin of plugins) {
        try {
          const response = await pluginsApi.installPluginFromGitHub(
            repoUrl,
            plugin.path,
            branch,
            false, // Don't force for bulk installs
          );
          results.success.push({
            id: plugin.id,
            name: plugin.name || plugin.id,
            response,
          });
          if (response.requires_restart) {
            results.requiresRestart = true;
          }
          if (response.branch_switched) {
            pluginBranchSwitched.value = true;
            pluginActualBranch.value = response.branch || branch;
          }
          if (response.frontend_rebuild_triggered) {
            pluginFrontendRebuildTriggered.value = true;
          }
        } catch (error) {
          results.failed.push({
            id: plugin.id,
            name: plugin.name || plugin.id,
            error:
              error.response?.data?.detail || error.message || "Unknown error",
          });
        }
      }

      // Build combined message
      if (results.success.length > 0 && results.failed.length === 0) {
        // All succeeded
        const successNames = results.success.map((s) => s.name).join(", ");
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${successNames}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else if (results.success.length > 0 && results.failed.length > 0) {
        // Partial success
        const successNames = results.success.map((s) => s.name).join(", ");
        const failedNames = results.failed.map((f) => f.name).join(", ");
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${successNames}`;
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${failedNames}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else if (results.failed.length > 0) {
        // All failed
        const failedNames = results.failed.map((f) => f.name).join(", ");
        const failedDetails = results.failed
          .map((f) => `${f.name}: ${f.error}`)
          .join("; ");
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${failedNames}. Details: ${failedDetails}`;
      }

      // Refresh installed plugins list
      // Only refresh if we had any successes
      if (results.success.length > 0) {
        await loadPlugins();
      }

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
          pluginInstallError.value = "";
        }, 10000);
      }
    } catch (error) {
      pluginInstallError.value =
        error.response?.data?.detail ||
        error.message ||
        "Failed to install plugins from GitHub";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Uninstall plugin
  const uninstallPlugin = async (pluginId, pluginType = null) => {
    try {
      await pluginsApi.uninstallPlugin(pluginId, pluginType);
      await loadPlugins();
    } catch (error) {
      logError("[usePlugins]", "Failed to uninstall plugin:", error);
      throw error;
    }
  };

  // Toggle plugin enabled state
  const togglePlugin = async (pluginId, enabled) => {
    try {
      await pluginsApi.updatePluginConfig(pluginId, { enabled });

      // Update local state immediately (optimistic update)
      const plugin = plugins.value.find((p) => p.id === pluginId);
      if (plugin) {
        plugin.enabled = enabled;
      }

      // If enabling and there are instances, start them all
      if (
        enabled &&
        pluginInstances.value[pluginId] &&
        pluginInstances.value[pluginId].length > 0
      ) {
        const instances = pluginInstances.value[pluginId];
        const promises = instances.map((instance) =>
          pluginsApi.startPluginInstance(instance.id),
        );
        await Promise.all(promises);
      }
      // If disabling and there are instances, stop them all
      else if (
        !enabled &&
        pluginInstances.value[pluginId] &&
        pluginInstances.value[pluginId].length > 0
      ) {
        const instances = pluginInstances.value[pluginId];
        const promises = instances.map((instance) =>
          pluginsApi.stopPluginInstance(instance.id),
        );
        await Promise.all(promises);
      }

      // Only reload instances for this specific plugin to update running status
      // This avoids reloading the entire plugins list
      try {
        const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
        pluginInstances.value[pluginId] = instancesResponse.instances || [];
      } catch (error) {
        logError(
          "[usePlugins]",
          `Failed to reload instances for plugin ${pluginId}:`,
          error,
        );
      }
    } catch (error) {
      logError("[usePlugins]", "Failed to toggle plugin:", error);
      // Revert optimistic update on error
      const plugin = plugins.value.find((p) => p.id === pluginId);
      if (plugin) {
        plugin.enabled = !enabled;
      }
      throw error;
    }
  };

  // Update service plugin display order
  const updatePluginOrder = async (pluginId, order) => {
    try {
      const currentConfig = pluginConfigs.value[pluginId] || {};
      const updatedConfig = { ...currentConfig, display_order: order };

      // Clean config values (ensure strings, not objects)
      const cleanedConfig = {};
      for (const [key, value] of Object.entries(updatedConfig)) {
        if (key === "display_order") {
          cleanedConfig[key] = String(value);
        } else if (value === null || value === undefined) {
          cleanedConfig[key] = "";
        } else if (typeof value === "object") {
          cleanedConfig[key] = value.value || value.default || "";
        } else {
          cleanedConfig[key] = String(value);
        }
      }

      await pluginsApi.updatePlugin(pluginId, cleanedConfig);
      pluginConfigs.value[pluginId] = cleanedConfig;
      pluginDisplayOrders.value[pluginId] = order;
    } catch (error) {
      logError(
        "[usePlugins]",
        `Failed to update order for plugin ${pluginId}:`,
        error,
      );
      throw error;
    }
  };

  // Update image plugin display order
  const updateImagePluginOrder = async (pluginId, order) => {
    try {
      const currentConfig = pluginConfigs.value[pluginId] || {};
      const updatedConfig = { ...currentConfig, display_order: order };

      // Clean config values (ensure strings, not objects)
      const cleanedConfig = {};
      for (const [key, value] of Object.entries(updatedConfig)) {
        if (key === "display_order") {
          cleanedConfig[key] = String(value);
        } else if (value === null || value === undefined) {
          cleanedConfig[key] = "";
        } else if (typeof value === "object") {
          cleanedConfig[key] = value.value || value.default || "";
        } else {
          cleanedConfig[key] = String(value);
        }
      }

      await pluginsApi.updatePlugin(pluginId, cleanedConfig);
      pluginConfigs.value[pluginId] = cleanedConfig;
      imagePluginDisplayOrders.value[pluginId] = order;
    } catch (error) {
      logError(
        "[usePlugins]",
        `Failed to update order for image plugin ${pluginId}:`,
        error,
      );
      throw error;
    }
  };

  // Update instance order for a plugin
  const updateInstanceOrder = async (pluginId, newOrder) => {
    try {
      // newOrder is an array of instance objects from draggable
      // Extract instance IDs in the new order
      const instanceIds = newOrder.map((instance) => instance.id);
      await pluginsApi.updatePluginInstancesOrder(pluginId, instanceIds);
      // Reload instances to get updated order
      const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
      pluginInstances.value[pluginId] = instancesResponse.instances || [];
    } catch (error) {
      logError(
        "[usePlugins]",
        `Failed to update instance order for ${pluginId}:`,
        error,
      );
      throw error;
    }
  };

  // Update image instance order for a plugin
  const updateImageInstanceOrder = async (pluginId, newOrder) => {
    try {
      // newOrder is an array of instance objects from draggable
      // Extract instance IDs in the new order
      const instanceIds = newOrder.map((instance) => instance.id);
      await pluginsApi.updatePluginInstancesOrder(pluginId, instanceIds);
      // Reload instances to get updated order
      const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
      pluginInstances.value[pluginId] = instancesResponse.instances || [];
    } catch (error) {
      logError(
        "[usePlugins]",
        `Failed to update image instance order for ${pluginId}:`,
        error,
      );
      throw error;
    }
  };

  return {
    // State
    plugins,
    pluginInstances,
    pluginConfigs,
    pluginDisplayOrders,
    imagePluginDisplayOrders,
    loadingPlugins,
    installingPlugin,
    enumeratingPlugins,
    selectedPluginZip,
    githubRepoUrl,
    githubBranch,
    availablePlugins,
    pluginInstallError,
    pluginInstallSuccess,
    pluginRequiresRestart,
    pluginBranchSwitched,
    pluginActualBranch,
    pluginFrontendRebuildTriggered,
    expandedPlugins,
    pluginFormData,
    savingPlugin,
    testingPlugin,
    fetchingPlugin,
    pluginSaveStatus,
    pluginTestStatus,
    pluginFetchStatus,
    // Computed
    imagePlugins,
    sortedPluginCategories,
    // Methods
    loadPlugins,
    installPluginFromZip,
    enumeratePluginsFromGitHub,
    installPluginFromGitHub,
    installPluginsFromGitHub,
    uninstallPlugin,
    togglePlugin,
    updatePluginOrder,
    updateImagePluginOrder,
    updateInstanceOrder,
    updateImageInstanceOrder,
  };
}
