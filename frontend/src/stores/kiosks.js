import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import { getCachedData, setCachedData } from "@/utils/cache";
import { logError } from "@/utils/logger";

const CACHE_KEY = "kiosks_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useKiosksStore = defineStore("kiosks", () => {
  const kiosks = ref([]);
  let refreshSequence = 0;

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

  // Background presence refreshes must not replace configuration currently
  // being edited. Merge each kiosk's live fields but retain its list overrides.
  async function refreshKiosks() {
    const sequence = ++refreshSequence;
    try {
      const response = await api.get("/kiosks");
      if (sequence !== refreshSequence) return;
      const currentById = new Map(kiosks.value.map(k => [k.id, k]));
      const fresh = response.data?.kiosks ?? [];
      kiosks.value = fresh.map(k => {
        const current = currentById.get(k.id);
        return current ? { ...k, overrides: current.overrides ?? k.overrides } : k;
      });
      setCachedData(CACHE_KEY, kiosks.value);
    } catch {
      // Quietly keep the last good data; the next visible interval can retry.
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

  // A screen without an admin session may only merge the keys it is changing
  // into its own layer (F2, settings-scope §7.9). Nothing else in the layer is
  // touched, and the server answers with the merged layer. Returns null when
  // the response carries no layer, so callers keep their last known copy.
  async function mergeOverrides(id, partial) {
    const response = await api.patch(`/kiosks/${encodeURIComponent(id)}/overrides`, {
      overrides: partial,
    });
    return response.data?.overrides ?? null;
  }

  // Keep the list's copy in step after a write (the list carries overrides so
  // screens can be previewed and named without N extra requests).
  function setKioskOverrides(id, overrides) {
    const kiosk = kiosks.value.find(k => k.id === id);
    if (!kiosk) return;
    kiosk.overrides = overrides;
    setCachedData(CACHE_KEY, kiosks.value);
  }

  async function fetchDeviceConfigVersion(id) {
    try {
      const response = await api.get(`/kiosks/${encodeURIComponent(id)}/config`);
      return response.data?.deviceConfigVersion ?? null;
    } catch {
      return null; // fail-open — caller degrades to "Not yet reported"
    }
  }

  // Removes the screen's row and everything stored for it. A screen that is
  // still running shows up again on its next check-in.
  async function removeKiosk(id) {
    try {
      await api.delete(`/kiosks/${encodeURIComponent(id)}`);
    } catch (err) {
      // Already gone (removed on another device): the goal is met.
      if (err?.response?.status !== 404) throw err;
    }
    // Drop any in-flight refresh so it can't put the row back.
    refreshSequence++;
    kiosks.value = kiosks.value.filter(k => k.id !== id);
    setCachedData(CACHE_KEY, kiosks.value);
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
    refreshKiosks,
    fetchOverrides,
    saveOverrides,
    mergeOverrides,
    setKioskOverrides,
    fetchDeviceConfigVersion,
    removeKiosk,
    triggerUpdate,
    fetchAvailableAgentVersion,
  };
});
