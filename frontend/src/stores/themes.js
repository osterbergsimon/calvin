import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../services/api";
import { logError } from "../utils/logger";

export const useThemesStore = defineStore("themes", () => {
  const selectedTheme = ref(null); // Currently selected theme ID

  /**
   * Get a specific theme by ID
   */
  const getTheme = async themeId => {
    try {
      const response = await api.get(`/plugins/${themeId}`);
      return response.data;
    } catch (err) {
      logError("[ThemesStore]", `Failed to fetch theme ${themeId}:`, err);
      throw err;
    }
  };

  /**
   * Set the selected theme
   */
  const setSelectedTheme = themeId => {
    selectedTheme.value = themeId;
  };

  return {
    selectedTheme,
    getTheme,
    setSelectedTheme,
  };
});
