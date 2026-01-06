/**
 * Composable for managing configuration form state and updates.
 */

import { ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import * as configApi from "../services/configApi";

export function useConfigForm(initialConfig = {}) {
  const configStore = useConfigStore();
  const localConfig = ref({ ...initialConfig });
  const saving = ref(false);
  const error = ref("");

  // Initialize from config store
  const loadConfig = async () => {
    try {
      await configStore.fetchConfig();
      // Merge store config with initial config
      localConfig.value = {
        ...initialConfig,
        ...configStore.config,
      };
    } catch (err) {
      console.error("Failed to load config:", err);
      error.value = "Failed to load configuration";
    }
  };

  // Update a single config value
  const updateConfigValue = async (key, value) => {
    localConfig.value[key] = value;
    await saveConfig({ [key]: value });
  };

  // Update multiple config values
  const updateConfig = async (updates) => {
    Object.assign(localConfig.value, updates);
    await saveConfig(updates);
  };

  // Save config to backend
  const saveConfig = async (updates = null) => {
    saving.value = true;
    error.value = "";

    try {
      const configToSave = updates || localConfig.value;
      await configApi.updateConfig(configToSave);
      await configStore.updateConfig(configToSave);
    } catch (err) {
      console.error("Failed to save config:", err);
      error.value =
        err.response?.data?.detail ||
        err.message ||
        "Failed to save configuration";
      throw err;
    } finally {
      saving.value = false;
    }
  };

  // Reset to store values
  const resetConfig = async () => {
    await loadConfig();
  };

  return {
    localConfig,
    saving,
    error,
    loadConfig,
    updateConfigValue,
    updateConfig,
    saveConfig,
    resetConfig,
  };
}
