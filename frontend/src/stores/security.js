import { defineStore } from "pinia";
import api from "@/services/api";
import { logError } from "@/utils/logger";

export const useSecurityStore = defineStore("security", () => {
  async function fetchAllowedOrigins() {
    try {
      const response = await api.get("/security/allowed-origins");
      return response.data?.origins ?? [];
    } catch (err) {
      logError("[security]", "Failed to fetch allowed origins:", err);
      throw err;
    }
  }

  async function saveAllowedOrigins(origins) {
    await api.put("/security/allowed-origins", { origins });
  }

  async function fetchSealedMode() {
    try {
      const response = await api.get("/security/sealed-mode");
      return response.data?.sealed_mode ?? false;
    } catch (err) {
      logError("[security]", "Failed to fetch sealed mode:", err);
      throw err;
    }
  }

  async function saveSealedMode(sealedMode) {
    await api.put("/security/sealed-mode", { sealed_mode: sealedMode });
  }

  return { fetchAllowedOrigins, saveAllowedOrigins, fetchSealedMode, saveSealedMode };
});
