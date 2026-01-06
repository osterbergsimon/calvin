/**
 * API service for plugin-related operations.
 */

import api from "./api";

/**
 * Get all plugins (with optional filtering).
 */
export async function getPlugins(params = {}) {
  const response = await api.get("/plugins", { params });
  return response.data;
}

/**
 * Get a specific plugin by ID.
 */
export async function getPlugin(pluginId) {
  const response = await api.get(`/plugins/${pluginId}`);
  return response.data;
}

/**
 * Get installed plugins.
 */
export async function getInstalledPlugins() {
  const response = await api.get("/plugins/installed");
  return response.data;
}

/**
 * Get plugin instances.
 */
export async function getPluginInstances(pluginId) {
  const response = await api.get(`/plugins/${pluginId}/instances`);
  return response.data;
}

/**
 * Get plugin configuration.
 */
export async function getPluginConfig(pluginId) {
  const response = await api.get(`/plugins/${pluginId}/config`);
  return response.data;
}

/**
 * Update plugin configuration.
 */
export async function updatePluginConfig(pluginId, config) {
  const response = await api.put(`/plugins/${pluginId}`, config);
  return response.data;
}

/**
 * Update plugin instance order.
 */
export async function updatePluginInstanceOrder(pluginId, orders) {
  const response = await api.put(
    `/plugins/${pluginId}/instances/order`,
    orders,
  );
  return response.data;
}

/**
 * Start a plugin instance.
 */
export async function startPluginInstance(instanceId) {
  const response = await api.post(`/plugins/instances/${instanceId}/start`);
  return response.data;
}

/**
 * Stop a plugin instance.
 */
export async function stopPluginInstance(instanceId) {
  const response = await api.post(`/plugins/instances/${instanceId}/stop`);
  return response.data;
}

/**
 * Install plugin from zip file.
 */
export async function installPluginFromZip(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/plugins/install", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

/**
 * Enumerate plugins from GitHub repository.
 */
export async function enumeratePluginsFromGitHub(repoUrl, branch = "main") {
  const response = await api.post("/plugins/github/enumerate", {
    repo_url: repoUrl,
    branch: branch,
  });
  return response.data;
}

/**
 * Install plugin from GitHub.
 */
export async function installPluginFromGitHub(
  repoUrl,
  pluginPath,
  branch = "main",
) {
  const response = await api.post("/plugins/github/install", {
    repo_url: repoUrl,
    plugin_path: pluginPath,
    branch: branch,
  });
  return response.data;
}

/**
 * Uninstall a plugin.
 */
export async function uninstallPlugin(pluginId, pluginType = null) {
  const params = pluginType ? { plugin_type: pluginType } : {};
  const response = await api.delete(`/plugins/installed/${pluginId}`, {
    params,
  });
  return response.data;
}

/**
 * Test plugin connection.
 */
export async function testPlugin(pluginId) {
  const response = await api.post(`/plugins/${pluginId}/test`);
  return response.data;
}

/**
 * Fetch plugin data.
 */
export async function fetchPlugin(pluginId) {
  const response = await api.post(`/plugins/${pluginId}/fetch`);
  return response.data;
}
