import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import { getCachedData, setCachedData } from "@/utils/cache";
import { logError } from "@/utils/logger";

const CACHE_KEY = "kiosks_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useKiosksStore = defineStore("kiosks", () => {
  const kiosks = ref([]);

  async function loadKiosks() {
    try {
      const response = await api.get("/kiosks");
      kiosks.value = response.data?.kiosks ?? [];
      setCachedData(CACHE_KEY, kiosks.value);
    } catch (err) {
      logError("[kiosks]", "Failed to load kiosks, using cache:", err);
      const cached = getCachedData(CACHE_KEY, CACHE_TTL, { allowStale: true });
      if (cached) kiosks.value = cached;
    }
  }

  async function fetchOverrides(id) {
    try {
      const response = await api.get(`/kiosks/${encodeURIComponent(id)}/overrides`);
      return response.data?.overrides ?? {};
    } catch (err) {
      if (err?.response?.status === 404) return {}; // known-seen kiosk with no overrides yet
      throw err;
    }
  }

  async function saveOverrides(id, overrides) {
    await api.put(`/kiosks/${encodeURIComponent(id)}/overrides`, { overrides });
  }

  async function fetchDeviceConfigVersion(id) {
    try {
      const response = await api.get(`/kiosks/${encodeURIComponent(id)}/config`);
      return response.data?.deviceConfigVersion ?? null;
    } catch {
      return null; // fail-open — caller degrades to "Not yet reported"
    }
  }

  async function triggerUpdate(id) {
    await api.post(`/kiosks/${encodeURIComponent(id)}/update`);
    await loadKiosks();
  }

  async function fetchAvailableAgentVersion() {
    try {
      const response = await api.get("/kiosks/agent/manifest");
      return response.data?.version ?? null;
    } catch {
      return null; // fail-open — caller degrades gracefully
    }
  }

  return {
    kiosks,
    loadKiosks,
    fetchOverrides,
    saveOverrides,
    fetchDeviceConfigVersion,
    triggerUpdate,
    fetchAvailableAgentVersion,
  };
});
