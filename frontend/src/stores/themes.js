import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../services/api";
import { logError } from "../utils/logger";

export const useThemesStore = defineStore("themes", () => {
  const selectedTheme = ref(null); // Currently selected theme ID

  /**
   * Get a specific theme by ID
   */
  // Callers asking for the same theme while a request is in flight share it
  // (calvin-hwjz); a settled or failed request is not kept.
  const inflight = new Map();
  const getTheme = themeId => {
    if (inflight.has(themeId)) return inflight.get(themeId);
    const request = (async () => {
      try {
        const response = await api.get(`/plugins/${themeId}`);
        return response.data;
      } catch (err) {
        logError("[ThemesStore]", `Failed to fetch theme ${themeId}:`, err);
        throw err;
      } finally {
        inflight.delete(themeId);
      }
    })();
    inflight.set(themeId, request);
    return request;
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
