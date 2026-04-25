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
const pluginFrontendRebuildResult = ref(null); // null | { success: bool, message: str }
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
  return plugins.value.filter(p => p.type === "image" && p.enabled);
});

const sortedPluginCategories = computed(() => {
  const categories = [
    { type: "calendar", label: "Calendar", plugins: [] },
    { type: "image", label: "Image", plugins: [] },
    { type: "service", label: "Service", plugins: [] },
    { type: "backend", label: "Backend", plugins: [] },
    { type: "theme", label: "Theme", plugins: [] },
  ];

  plugins.value.forEach(plugin => {
    const category = categories.find(c => c.type === plugin.type);
    if (category) {
      category.plugins.push(plugin);
    }
  });

  return categories.filter(c => c.plugins.length > 0);
});

// Poll the backend rebuild-status endpoint until building is complete,
// updating pluginFrontendRebuildResult along the way.
let _rebuildPollTimer = null;
function _startRebuildPolling() {
  if (_rebuildPollTimer !== null) return; // already polling
  pluginFrontendRebuildResult.value = {
    building: true,
    success: null,
    message: "Building frontend, this may take a minute…",
  };

  const poll = async () => {
    try {
      const status = await pluginsApi.getRebuildStatus();
      if (status.state === "building") {
        pluginFrontendRebuildResult.value = {
          building: true,
          success: null,
          message: status.message,
        };
        _rebuildPollTimer = setTimeout(poll, 2000);
      } else {
        _rebuildPollTimer = null;
        pluginFrontendRebuildResult.value = {
          building: false,
          success: status.state === "done",
          message: status.message,
        };
      }
    } catch {
      _rebuildPollTimer = null;
    }
  };
  _rebuildPollTimer = setTimeout(poll, 1000);
}

export function usePlugins() {
  // Load plugins
  const loadPlugins = async () => {
    loadingPlugins.value = true;
    try {
      const [pluginsResponse, installedResponse] = await Promise.all([
        pluginsApi.getPlugins(),
        pluginsApi.getInstalledPlugins().catch(error => {
          // Silently handle 404 for installed plugins endpoint
          if (error.response?.status === 404) {
            return { plugins: [] };
          }
          logWarn("[usePlugins]", "Failed to load installed plugins:", error);
          return { plugins: [] };
        }),
      ]);

      const allPlugins = pluginsResponse.plugins || [];
      const installedIds = new Set((installedResponse.plugins || []).map(p => p.id));

      // Mark installed plugins
      plugins.value = allPlugins.map(plugin => ({
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

          // Get display_order from the plugin list first; it is app-managed,
          // not part of the plugin-owned common_config_schema.
          let displayOrder = plugin.display_order;

          const [instancesResponse, configResponse] = await Promise.all([
            pluginsApi.getPluginInstances(plugin.id).catch(() => ({ instances: [] })),
            pluginsApi.getPluginConfig(plugin.id).catch(() => ({})),
          ]);

          pluginInstances.value[plugin.id] = instancesResponse.instances || [];
          pluginConfigs.value[plugin.id] = configResponse || {};

          // Load display orders from config (fallback to config API if not in schema)
          const config = configResponse || {};
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
              `Invalid display_order for ${plugin.id}: ${displayOrder}, defaulting to 0`
            );
            parsedOrder = 0;
          }

          if (plugin.type === "service") {
            pluginDisplayOrders.value[plugin.id] = parsedOrder;
          } else if (plugin.type === "image") {
            imagePluginDisplayOrders.value[plugin.id] = parsedOrder;
          }
        } catch (error) {
          logError("[usePlugins]", `Failed to load data for plugin ${plugin.id}:`, error);
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
  const installPluginFromZip = async file => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;

    try {
      const response = await pluginsApi.installPluginFromZip(file);
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      if (response.frontend_rebuild_in_progress) {
        _startRebuildPolling();
      }

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
        }, 5000);
      }

      await loadPlugins();
    } catch (error) {
      pluginInstallError.value =
        error.response?.data?.detail || error.message || "Failed to install plugin";
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
      const response = await pluginsApi.enumeratePluginsFromGitHub(repoUrl, branch);
      const enumeratedPlugins = response.plugins || [];
      const enumeratedThemes = response.themes || [];

      // Merge themes into plugins array (themes are also plugins for installation purposes)
      const allItems = [
        ...enumeratedPlugins,
        ...enumeratedThemes.map(theme => ({
          ...theme,
          type: "theme", // Ensure type is set to theme
        })),
      ];

      // Get installed plugins to compare versions
      let installedPluginsMap = {};
      try {
        const installedResponse = await pluginsApi.getInstalledPlugins();
        const installed = installedResponse.plugins || [];
        installedPluginsMap = Object.fromEntries(installed.map(p => [p.id, p]));
      } catch (error) {
        // Silently handle 404 for installed plugins endpoint
        if (error.response?.status !== 404) {
          logWarn("[usePlugins]", "Failed to load installed plugins for comparison:", error);
        }
      }

      // Mark installed plugins and add version info
      availablePlugins.value = allItems.map(plugin => {
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
      logError("[usePlugins]", "Failed to enumerate plugins from GitHub:", error);
      pluginInstallError.value =
        error.response?.data?.detail || error.message || "Failed to enumerate plugins from GitHub";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      enumeratingPlugins.value = false;
    }
  };

  // Install plugin from GitHub
  const installPluginFromGitHub = async (repoUrl, pluginPath, branch = "main", force = false) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;
    pluginBranchSwitched.value = false;
    pluginActualBranch.value = "";

    try {
      const response = await pluginsApi.installPluginFromGitHub(repoUrl, pluginPath, branch, force);
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      pluginBranchSwitched.value = response.branch_switched || false;
      pluginActualBranch.value = response.branch || branch;
      if (response.frontend_rebuild_in_progress) {
        _startRebuildPolling();
      }

      // Mark the installed plugin in-place so the list stays visible
      const installedId = response.manifest?.id || pluginPath;
      const idx = availablePlugins.value.findIndex(
        p => p.id === installedId || p.path === pluginPath
      );
      if (idx !== -1) {
        availablePlugins.value[idx] = {
          ...availablePlugins.value[idx],
          _installed: true,
          _installedVersion: response.manifest?.version || availablePlugins.value[idx].version,
        };
      }

      await loadPlugins();

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
        }, 5000);
      }
    } catch (error) {
      const errorDetail = error.response?.data?.detail || error.message || "";
      if (errorDetail.includes("older than") || errorDetail.includes("version")) {
        pluginInstallError.value = errorDetail;
      } else {
        pluginInstallError.value = errorDetail || "Failed to install plugin from GitHub";
      }
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Install multiple plugins from GitHub
  const installPluginsFromGitHub = async (plugins, repoUrl, branch = "main") => {
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
            false // Don't force for bulk installs
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
          if (response.frontend_rebuild_in_progress) {
            _startRebuildPolling();
          }
        } catch (error) {
          results.failed.push({
            id: plugin.id,
            name: plugin.name || plugin.id,
            error: error.response?.data?.detail || error.message || "Unknown error",
          });
        }
      }

      // Build combined message
      if (results.success.length > 0 && results.failed.length === 0) {
        // All succeeded
        const successNames = results.success.map(s => s.name).join(", ");
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${successNames}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else if (results.success.length > 0 && results.failed.length > 0) {
        // Partial success
        const successNames = results.success.map(s => s.name).join(", ");
        const failedNames = results.failed.map(f => f.name).join(", ");
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${successNames}`;
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${failedNames}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else if (results.failed.length > 0) {
        // All failed
        const failedNames = results.failed.map(f => f.name).join(", ");
        const failedDetails = results.failed.map(f => `${f.name}: ${f.error}`).join("; ");
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${failedNames}. Details: ${failedDetails}`;
      }

      // Mark installed plugins in-place so the list stays visible
      for (const s of results.success) {
        const idx = availablePlugins.value.findIndex(
          p => p.id === s.id || p.path === s.response?.manifest?.id
        );
        if (idx !== -1) {
          availablePlugins.value[idx] = {
            ...availablePlugins.value[idx],
            _installed: true,
            _installedVersion: s.response?.manifest?.version || availablePlugins.value[idx].version,
          };
        }
      }

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
        error.response?.data?.detail || error.message || "Failed to install plugins from GitHub";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Enumerate plugins from a local path (dev mode only)
  const enumeratePluginsFromLocal = async localPath => {
    if (!localPath || !localPath.trim()) {
      pluginInstallError.value = "Local path is required";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
      return;
    }

    enumeratingPlugins.value = true;
    availablePlugins.value = [];

    try {
      const response = await pluginsApi.enumeratePluginsFromLocal(localPath);
      const enumeratedPlugins = response.plugins || [];
      const enumeratedThemes = response.themes || [];

      const allItems = [
        ...enumeratedPlugins,
        ...enumeratedThemes.map(theme => ({ ...theme, type: "theme" })),
      ];

      let installedPluginsMap = {};
      try {
        const installedResponse = await pluginsApi.getInstalledPlugins();
        installedPluginsMap = Object.fromEntries(
          (installedResponse.plugins || []).map(p => [p.id, p])
        );
      } catch (error) {
        if (error.response?.status !== 404) {
          logWarn("[usePlugins]", "Failed to load installed plugins for comparison:", error);
        }
      }

      availablePlugins.value = allItems.map(plugin => {
        const installed = installedPluginsMap[plugin.id];
        return installed
          ? {
              ...plugin,
              _installed: true,
              _installedVersion: installed.version || null,
            }
          : { ...plugin, _installed: false, _installedVersion: null };
      });
    } catch (error) {
      logError("[usePlugins]", "Failed to enumerate plugins from local path:", error);
      pluginInstallError.value =
        error.response?.data?.detail ||
        error.message ||
        "Failed to enumerate plugins from local path";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      enumeratingPlugins.value = false;
    }
  };

  // Install a single plugin from a local path (dev mode only)
  const installPluginFromLocal = async (localPath, pluginPath, force = false) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;

    try {
      const response = await pluginsApi.installPluginFromLocal(localPath, pluginPath, force);
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      if (response.frontend_rebuild_in_progress) {
        _startRebuildPolling();
      }

      // Mark the installed plugin in-place so the list stays visible
      const installedId = response.manifest?.id || pluginPath;
      const idx = availablePlugins.value.findIndex(
        p => p.id === installedId || p.path === pluginPath
      );
      if (idx !== -1) {
        availablePlugins.value[idx] = {
          ...availablePlugins.value[idx],
          _installed: true,
          _installedVersion: response.manifest?.version || availablePlugins.value[idx].version,
        };
      }

      await loadPlugins();

      if (!pluginRequiresRestart.value) {
        setTimeout(() => {
          pluginInstallSuccess.value = "";
        }, 5000);
      }
    } catch (error) {
      pluginInstallError.value =
        error.response?.data?.detail || error.message || "Failed to install plugin from local path";
      setTimeout(() => {
        pluginInstallError.value = "";
      }, 10000);
    } finally {
      installingPlugin.value = false;
    }
  };

  // Install multiple plugins from a local path (dev mode only)
  const installPluginsFromLocal = async (plugins, localPath) => {
    installingPlugin.value = true;
    pluginInstallError.value = "";
    pluginInstallSuccess.value = "";
    pluginRequiresRestart.value = false;

    const results = { success: [], failed: [], requiresRestart: false };

    try {
      for (const plugin of plugins) {
        try {
          const response = await pluginsApi.installPluginFromLocal(localPath, plugin.path, false);
          results.success.push({
            id: plugin.id,
            name: plugin.name || plugin.id,
            response,
          });
          if (response.requires_restart) results.requiresRestart = true;
          if (response.frontend_rebuild_in_progress) {
            _startRebuildPolling();
          }
        } catch (error) {
          results.failed.push({
            id: plugin.id,
            name: plugin.name || plugin.id,
            error: error.response?.data?.detail || error.message || "Unknown error",
          });
        }
      }

      if (results.success.length > 0 && results.failed.length === 0) {
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${results.success.map(s => s.name).join(", ")}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else if (results.success.length > 0) {
        pluginInstallSuccess.value = `Successfully installed ${results.success.length} plugin(s): ${results.success.map(s => s.name).join(", ")}`;
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${results.failed.map(f => f.name).join(", ")}`;
        pluginRequiresRestart.value = results.requiresRestart;
      } else {
        pluginInstallError.value = `Failed to install ${results.failed.length} plugin(s): ${results.failed.map(f => `${f.name}: ${f.error}`).join("; ")}`;
      }

      // Mark installed plugins in-place so the list stays visible
      for (const s of results.success) {
        const idx = availablePlugins.value.findIndex(
          p => p.id === s.id || p.path === s.response?.manifest?.id
        );
        if (idx !== -1) {
          availablePlugins.value[idx] = {
            ...availablePlugins.value[idx],
            _installed: true,
            _installedVersion: s.response?.manifest?.version || availablePlugins.value[idx].version,
          };
        }
      }

      if (results.success.length > 0) await loadPlugins();

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
        "Failed to install plugins from local path";
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
      const response = await pluginsApi.uninstallPlugin(pluginId, pluginType);
      if (response.frontend_rebuild_in_progress) {
        _startRebuildPolling();
      }
      await loadPlugins();
    } catch (error) {
      logError("[usePlugins]", "Failed to uninstall plugin:", error);
      throw error;
    }
  };

  const loadPluginConfig = async pluginId => {
    try {
      const config = await pluginsApi.getPluginConfig(pluginId);
      pluginConfigs.value[pluginId] = config;
      pluginFormData.value[pluginId] = { ...config };
      return config;
    } catch (error) {
      logError("[usePlugins]", `Failed to load config for plugin ${pluginId}:`, error);
      throw error;
    }
  };

  const updatePluginFormValue = (pluginId, key, value) => {
    if (!pluginFormData.value[pluginId]) {
      pluginFormData.value[pluginId] = {};
    }
    pluginFormData.value[pluginId][key] = value;
  };

  const savePluginConfig = async pluginId => {
    savingPlugin.value = pluginId;
    pluginSaveStatus.value[pluginId] = null;

    try {
      const config = pluginFormData.value[pluginId] || {};
      await pluginsApi.updatePlugin(pluginId, config);
      const normalizedConfig = await loadPluginConfig(pluginId);
      pluginConfigs.value[pluginId] = { ...normalizedConfig };
      pluginFormData.value[pluginId] = { ...normalizedConfig };
      pluginSaveStatus.value[pluginId] = {
        success: true,
        message: "Configuration saved successfully",
      };
      setTimeout(() => {
        pluginSaveStatus.value[pluginId] = null;
      }, 5000);
    } catch (error) {
      logError("[usePlugins]", `Failed to save config for plugin ${pluginId}:`, error);
      pluginSaveStatus.value[pluginId] = {
        success: false,
        message: error.response?.data?.detail || error.message || "Failed to save configuration",
      };
      throw error;
    } finally {
      savingPlugin.value = null;
    }
  };

  const testPluginConnection = async pluginId => {
    testingPlugin.value[pluginId] = true;
    pluginTestStatus.value[pluginId] = null;

    try {
      const testConfig = pluginFormData.value[pluginId] || {};
      const response = await pluginsApi.testPlugin(pluginId, testConfig);
      pluginTestStatus.value[pluginId] = {
        success: response.success || false,
        message: response.message || "Test completed",
      };
      return response;
    } catch (error) {
      logError("[usePlugins]", `Failed to test plugin ${pluginId}:`, error);
      pluginTestStatus.value[pluginId] = {
        success: false,
        message: error.response?.data?.detail || error.message || "Test failed",
      };
      throw error;
    } finally {
      testingPlugin.value[pluginId] = false;
    }
  };

  const fetchPluginNow = async pluginId => {
    fetchingPlugin.value[pluginId] = true;
    pluginFetchStatus.value[pluginId] = null;

    try {
      const response = await pluginsApi.fetchPlugin(pluginId);
      pluginFetchStatus.value[pluginId] = {
        success: true,
        message: "Fetch initiated successfully",
      };
      return response;
    } catch (error) {
      logError("[usePlugins]", `Failed to fetch plugin ${pluginId}:`, error);
      pluginFetchStatus.value[pluginId] = {
        success: false,
        message: error.response?.data?.detail || error.message || "Failed to initiate fetch",
      };
      throw error;
    } finally {
      fetchingPlugin.value[pluginId] = false;
    }
  };

  // Toggle plugin enabled state
  const togglePlugin = async (pluginId, enabled) => {
    try {
      await pluginsApi.updatePluginConfig(pluginId, { enabled });

      // Update local state immediately (optimistic update)
      const plugin = plugins.value.find(p => p.id === pluginId);
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
        const promises = instances.map(instance => pluginsApi.startPluginInstance(instance.id));
        await Promise.all(promises);
      }
      // If disabling and there are instances, stop them all
      else if (
        !enabled &&
        pluginInstances.value[pluginId] &&
        pluginInstances.value[pluginId].length > 0
      ) {
        const instances = pluginInstances.value[pluginId];
        const promises = instances.map(instance => pluginsApi.stopPluginInstance(instance.id));
        await Promise.all(promises);
      }

      // Only reload instances for this specific plugin to update running status
      // This avoids reloading the entire plugins list
      try {
        const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
        pluginInstances.value[pluginId] = instancesResponse.instances || [];
      } catch (error) {
        logError("[usePlugins]", `Failed to reload instances for plugin ${pluginId}:`, error);
      }
    } catch (error) {
      logError("[usePlugins]", "Failed to toggle plugin:", error);
      // Revert optimistic update on error
      const plugin = plugins.value.find(p => p.id === pluginId);
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
      logError("[usePlugins]", `Failed to update order for plugin ${pluginId}:`, error);
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
      logError("[usePlugins]", `Failed to update order for image plugin ${pluginId}:`, error);
      throw error;
    }
  };

  // Update instance order for a plugin
  const updateInstanceOrder = async (pluginId, newOrder) => {
    try {
      const instanceOrders = {};
      newOrder.forEach((instance, index) => {
        instanceOrders[instance.id] = index;
      });
      await pluginsApi.updatePluginInstanceOrder(pluginId, instanceOrders);
      // Reload instances to get updated order
      const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
      pluginInstances.value[pluginId] = instancesResponse.instances || [];
    } catch (error) {
      logError("[usePlugins]", `Failed to update instance order for ${pluginId}:`, error);
      throw error;
    }
  };

  // Update image instance order for a plugin
  const updateImageInstanceOrder = async (pluginId, newOrder) => {
    try {
      const instanceOrders = {};
      newOrder.forEach((instance, index) => {
        instanceOrders[instance.id] = index;
      });
      await pluginsApi.updatePluginInstanceOrder(pluginId, instanceOrders);
      // Reload instances to get updated order
      const instancesResponse = await pluginsApi.getPluginInstances(pluginId);
      pluginInstances.value[pluginId] = instancesResponse.instances || [];
    } catch (error) {
      logError("[usePlugins]", `Failed to update image instance order for ${pluginId}:`, error);
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
    pluginFrontendRebuildResult,
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
    enumeratePluginsFromLocal,
    installPluginFromLocal,
    installPluginsFromLocal,
    uninstallPlugin,
    loadPluginConfig,
    updatePluginFormValue,
    savePluginConfig,
    testPluginConnection,
    fetchPluginNow,
    togglePlugin,
    updatePluginOrder,
    updateImagePluginOrder,
    updateInstanceOrder,
    updateImageInstanceOrder,
  };
}
