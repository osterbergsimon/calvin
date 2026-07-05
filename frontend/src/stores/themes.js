import { defineStore } from "pinia";
import { ref, computed } from "vue";
import axios from "axios";
import { logError, logInfo } from "../utils/logger";

export const useThemesStore = defineStore("themes", () => {
  const themes = ref([]);
  const installedThemes = ref([]);
  const selectedTheme = ref(null); // Currently selected theme ID
  const loading = ref(false);
  const error = ref(null);

  /**
   * Fetch all available themes (built-in + installed)
   */
  const fetchThemes = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/plugins?plugin_type=theme");
      // Get full theme details (with variables) for each theme
      const themesList = response.data.plugins || [];
      const themesWithDetails = [];
      for (const theme of themesList) {
        try {
          const themeDetail = await axios.get(`/api/plugins/${theme.id}`);
          themesWithDetails.push(themeDetail.data);
        } catch {
          themesWithDetails.push(theme);
        }
      }
      themes.value = themesWithDetails;
      return themes.value;
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to fetch themes:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetch installed themes only
   */
  const fetchInstalledThemes = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/plugins/installed");
      // The endpoint returns { plugins: [...] } (no `themes` key) — filter that.
      installedThemes.value = (response.data.plugins || []).filter(p => p.type === "theme");
      return installedThemes.value;
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to fetch installed themes:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get a specific theme by ID
   */
  const getTheme = async themeId => {
    try {
      const response = await axios.get(`/api/plugins/${themeId}`);
      return response.data;
    } catch (err) {
      logError("[ThemesStore]", `Failed to fetch theme ${themeId}:`, err);
      throw err;
    }
  };

  /**
   * Install a theme from a zip file
   */
  const installTheme = async file => {
    loading.value = true;
    error.value = null;
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post("/api/plugins/install", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // Refresh themes list
      await fetchThemes();
      await fetchInstalledThemes();

      logInfo("[ThemesStore]", `Theme installed: ${response.data.manifest?.id}`);
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to install theme:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Install a theme from GitHub
   */
  const installThemeFromGitHub = async (repoUrl, themePath, branch = "main") => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.post("/api/plugins/github/install", {
        repo_url: repoUrl,
        // The handler requires `plugin_path` (themes install through the plugin path).
        plugin_path: themePath,
        branch: branch,
      });

      // Refresh themes list
      await fetchThemes();
      await fetchInstalledThemes();

      logInfo("[ThemesStore]", `Theme installed from GitHub: ${response.data.manifest?.id}`);
      return response.data;
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to install theme from GitHub:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Enumerate themes from GitHub repository
   */
  const enumerateThemesFromGitHub = async (repoUrl, branch = "main") => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.post("/api/plugins/github/enumerate", {
        repo_url: repoUrl,
        branch: branch,
      });
      // Extract themes from response (plugins API returns both plugins and themes)
      if (response.data.themes) {
        return response.data;
      }
      // If no themes key, return empty themes array
      return { themes: [] };
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to enumerate themes from GitHub:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Uninstall a theme
   */
  const uninstallTheme = async themeId => {
    loading.value = true;
    error.value = null;
    try {
      await axios.delete(`/api/plugins/installed/${themeId}`);

      // Refresh themes list
      await fetchThemes();
      await fetchInstalledThemes();

      logInfo("[ThemesStore]", `Theme uninstalled: ${themeId}`);
      return { success: true };
    } catch (err) {
      error.value = err.message;
      logError("[ThemesStore]", "Failed to uninstall theme:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Set the selected theme
   */
  const setSelectedTheme = themeId => {
    selectedTheme.value = themeId;
  };

  /**
   * Get built-in themes
   */
  const builtInThemes = computed(() => {
    return themes.value.filter(theme => theme.is_builtin === true);
  });

  /**
   * Get installed (non-built-in) themes
   */
  const customThemes = computed(() => {
    return themes.value.filter(theme => theme.is_builtin !== true);
  });

  return {
    themes,
    installedThemes,
    selectedTheme,
    loading,
    error,
    fetchThemes,
    fetchInstalledThemes,
    getTheme,
    installTheme,
    installThemeFromGitHub,
    enumerateThemesFromGitHub,
    uninstallTheme,
    setSelectedTheme,
    builtInThemes,
    customThemes,
  };
});
