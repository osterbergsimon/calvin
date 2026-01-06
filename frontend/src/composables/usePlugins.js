/**
 * Composable for plugin management.
 */

import { ref, computed } from "vue";
import * as pluginsApi from "../services/pluginsApi";

export function usePlugins() {
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

  // Computed
  const imagePlugins = computed(() => {
    return plugins.value.filter((p) => p.type === "image" && p.enabled);
  });

  const sortedPluginCategories = computed(() => {
    const categories = [
      { type: "calendar", label: "Calendar", plugins: [] },
      { type: "image", label: "Image", plugins: [] },
      { type: "service", label: "Service", plugins: [] },
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

  // Load plugins
  const loadPlugins = async () => {
    loadingPlugins.value = true;
    try {
      const [pluginsResponse, installedResponse] = await Promise.all([
        pluginsApi.getPlugins(),
        pluginsApi.getInstalledPlugins(),
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
          const [instancesResponse, configResponse] = await Promise.all([
            pluginsApi.getPluginInstances(plugin.id),
            pluginsApi.getPluginConfig(plugin.id),
          ]);

          pluginInstances.value[plugin.id] = instancesResponse.instances || [];
          pluginConfigs.value[plugin.id] = configResponse.config || {};
        } catch (error) {
          console.error(`Failed to load data for plugin ${plugin.id}:`, error);
          pluginInstances.value[plugin.id] = [];
          pluginConfigs.value[plugin.id] = {};
        }
      }
    } catch (error) {
      console.error("Failed to load plugins:", error);
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
    enumeratingPlugins.value = true;
    availablePlugins.value = [];
    pluginBranchSwitched.value = false;
    pluginActualBranch.value = "";

    try {
      const response = await pluginsApi.enumeratePluginsFromGitHub(
        repoUrl,
        branch,
      );
      availablePlugins.value = response.plugins || [];
      pluginBranchSwitched.value = response.branch_switched || false;
      pluginActualBranch.value = response.branch || branch;
    } catch (error) {
      console.error("Failed to enumerate plugins from GitHub:", error);
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
      );
      pluginInstallSuccess.value = "Plugin installed successfully!";
      pluginRequiresRestart.value = response.requires_restart || false;
      pluginBranchSwitched.value = response.branch_switched || false;
      pluginActualBranch.value = response.branch || branch;

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

  // Uninstall plugin
  const uninstallPlugin = async (pluginId, pluginType = null) => {
    try {
      await pluginsApi.uninstallPlugin(pluginId, pluginType);
      await loadPlugins();
    } catch (error) {
      console.error("Failed to uninstall plugin:", error);
      throw error;
    }
  };

  // Toggle plugin enabled state
  const togglePlugin = async (pluginId, enabled) => {
    try {
      await pluginsApi.updatePluginConfig(pluginId, { enabled });
      await loadPlugins();
    } catch (error) {
      console.error("Failed to toggle plugin:", error);
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
    // Computed
    imagePlugins,
    sortedPluginCategories,
    // Methods
    loadPlugins,
    installPluginFromZip,
    enumeratePluginsFromGitHub,
    installPluginFromGitHub,
    uninstallPlugin,
    togglePlugin,
  };
}
