import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import { getCachedData, setCachedData } from "@/utils/cache";
import { logError } from "@/utils/logger";

const CACHE_KEY = "kiosks_list";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function withoutScreenNow(overrides) {
  if (!overrides || !("screenNow" in overrides || "screen_now" in overrides)) return overrides;
  const { screenNow: _screenNow, screen_now: _snake, ...rest } = overrides;
  return rest;
}

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
        if (!current) return k;
        let overrides = current.overrides ?? k.overrides;
        // A hold changed elsewhere: the server removed screenNow from the layer.
        const holdChanged =
          JSON.stringify(k.powerHold ?? null) !== JSON.stringify(current.powerHold ?? null);
        if (holdChanged || k.powerHold) overrides = withoutScreenNow(overrides);
        return { ...k, overrides };
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

  async function saveOverrides(id, overrides, requestOptions) {
    await api.put(
      `/kiosks/${encodeURIComponent(id)}/overrides`,
      { overrides },
      ...(requestOptions ? [requestOptions] : [])
    );
  }

  // A screen without an admin session may only merge the keys it is changing
  // into its own layer (F2, settings-scope §7.9). Nothing else in the layer is
  // touched, and the server answers with the merged layer. Returns null when
  // the response carries no layer, so callers keep their last known copy.
  async function mergeOverrides(id, partial, requestOptions) {
    const response = await api.patch(
      `/kiosks/${encodeURIComponent(id)}/overrides`,
      { overrides: partial },
      ...(requestOptions ? [requestOptions] : [])
    );
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

  // Screen power held from home automation or Settings (calvin-2ifv). The hold
  // lives outside the override layer, and setting or ending it removes
  // screenNow from the layer on the server. Keep the list's copy in step, or
  // a later save of this page would send an old manual choice back.
  function applyScreenPower(id, view, { wrote = false } = {}) {
    const kiosk = kiosks.value.find(k => k.id === id);
    if (!kiosk || !view) return;
    const hold = view.held ? { power: view.power, setAt: view.setAt, by: view.by } : null;
    // A write always leaves the layer without screenNow ("schedule" clears it too).
    if (wrote || hold || JSON.stringify(hold) !== JSON.stringify(kiosk.powerHold ?? null)) {
      kiosk.overrides = withoutScreenNow(kiosk.overrides);
    }
    kiosk.powerHold = hold;
    kiosk.agentHolds = view.agentHolds ?? kiosk.agentHolds ?? null;
    setCachedData(CACHE_KEY, kiosks.value);
  }

  async function setScreenPower(id, power) {
    const { data } = await api.put(`/kiosks/${encodeURIComponent(id)}/screen-power`, { power });
    applyScreenPower(id, data, { wrote: true });
    return data;
  }

  async function fetchScreenPower(id) {
    const { data } = await api.get(`/kiosks/${encodeURIComponent(id)}/screen-power`);
    applyScreenPower(id, data);
    return data;
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
    setScreenPower,
    fetchScreenPower,
    fetchAvailableAgentVersion,
  };
});
