import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "@/utils/cache";
import { logError } from "@/utils/logger";

const CACHE_KEY = "kiosks_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useKiosksStore = defineStore("kiosks", () => {
  const kiosks = ref([]);

  async function loadKiosks() {
    try {
      const response = await axios.get("/api/kiosks");
      kiosks.value = response.data?.kiosks ?? [];
      setCachedData(CACHE_KEY, kiosks.value);
    } catch (err) {
      logError("[kiosks]", "Failed to load kiosks, using cache:", err);
      const cached = getCachedData(CACHE_KEY, CACHE_TTL);
      if (cached) kiosks.value = cached;
    }
  }

  async function fetchOverrides(id) {
    try {
      const response = await axios.get(`/api/kiosks/${encodeURIComponent(id)}/overrides`);
      return response.data?.overrides ?? {};
    } catch (err) {
      if (err?.response?.status === 404) return {}; // known-seen kiosk with no overrides yet
      throw err;
    }
  }

  async function saveOverrides(id, overrides) {
    await axios.put(`/api/kiosks/${encodeURIComponent(id)}/overrides`, { overrides });
  }

  return { kiosks, loadKiosks, fetchOverrides, saveOverrides };
});
