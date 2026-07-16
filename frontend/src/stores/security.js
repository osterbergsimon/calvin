import { defineStore } from "pinia";
import axios from "axios";
import { logError } from "@/utils/logger";

export const useSecurityStore = defineStore("security", () => {
  async function fetchAllowedOrigins() {
    try {
      const response = await axios.get("/api/security/allowed-origins");
      return response.data?.origins ?? [];
    } catch (err) {
      logError("[security]", "Failed to fetch allowed origins:", err);
      throw err;
    }
  }

  async function saveAllowedOrigins(origins) {
    await axios.put("/api/security/allowed-origins", { origins });
  }

  async function fetchSealedMode() {
    try {
      const response = await axios.get("/api/security/sealed-mode");
      return response.data?.sealed_mode ?? false;
    } catch (err) {
      logError("[security]", "Failed to fetch sealed mode:", err);
      throw err;
    }
  }

  async function saveSealedMode(sealedMode) {
    await axios.put("/api/security/sealed-mode", { sealed_mode: sealedMode });
  }

  return { fetchAllowedOrigins, saveAllowedOrigins, fetchSealedMode, saveSealedMode };
});
