/**
 * API service for configuration-related operations.
 */

import api from "./api";

/**
 * Get configuration.
 */
export async function getConfig() {
  const response = await api.get("/config");
  return response.data;
}

/**
 * Update configuration.
 */
export async function updateConfig(config) {
  const response = await api.post("/config", config);
  return response.data;
}

/**
 * Get Git branches.
 */
export async function getGitBranches() {
  const response = await api.get("/config/git/branches");
  return response.data;
}
