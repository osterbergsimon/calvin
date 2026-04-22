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
 * Read plugin.json from a zip without installing it.
 * Returns the manifest so callers can inspect python_dependencies before committing.
 */
export async function inspectPluginZip(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/plugins/inspect", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
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
  force = false,
) {
  const response = await api.post("/plugins/github/install", {
    repo_url: repoUrl,
    plugin_path: pluginPath,
    branch: branch,
    force: force,
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
export async function testPlugin(pluginId, config = {}) {
  const response = await api.post(`/plugins/${pluginId}/test`, config);
  return response.data;
}

/**
 * Fetch plugin data.
 */
export async function fetchPlugin(pluginId) {
  const response = await api.post(`/plugins/${pluginId}/fetch`);
  return response.data;
}

/**
 * Geocode a location name to coordinates.
 */
export async function geocodeLocation(pluginId, location) {
  const response = await api.post(`/plugins/${pluginId}/geocode`, { location });
  return response.data;
}

/**
 * Update plugin (general update).
 */
export async function updatePlugin(pluginId, data) {
  const response = await api.put(`/plugins/${pluginId}`, data);
  return response.data;
}

/**
 * Create a new plugin instance.
 * All plugins (including iframe) are created by updating the plugin config,
 * which triggers the plugin's handle_plugin_config_update hook.
 */
export async function createPluginInstance(pluginId, instanceData) {
  // Use plugin config update to trigger instance creation
  // This will call handle_plugin_config_update hook which creates the instance
  // Include instance name and config in the update
  const configUpdate = {
    ...instanceData.config,
    _instance_name: instanceData.name, // Pass instance name as a special field
    _instance_enabled:
      instanceData.enabled !== undefined ? instanceData.enabled : true,
  };
  const response = await api.put(`/plugins/${pluginId}`, configUpdate);
  return response.data;
}

/**
 * Update a plugin instance.
 * Uses the dedicated instance update endpoint.
 */
export async function updatePluginInstance(instanceId, instanceData) {
  const response = await api.put(
    `/plugins/instances/${instanceId}`,
    instanceData,
  );
  return response.data;
}

/**
 * Delete a plugin instance.
 */
export async function deletePluginInstance(instanceId) {
  const response = await api.delete(`/plugins/instances/${instanceId}`);
  return response.data;
}

/**
 * Update plugin instances order (takes array of instance IDs in order).
 */
export async function updatePluginInstancesOrder(pluginId, instanceIds) {
  const response = await api.put(`/plugins/${pluginId}/instances/order`, {
    instance_ids: instanceIds,
  });
  return response.data;
}
