import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";

/**
 * The API key list (CLV-32). The secret is deliberately not kept here: `createKey`
 * hands it straight to the caller, which shows it once and drops it.
 */
export const useApiKeysStore = defineStore("apiKeys", () => {
  const keys = ref([]);
  const loading = ref(false);
  const loadFailed = ref(false);

  async function fetchKeys() {
    loading.value = true;
    loadFailed.value = false;
    try {
      const { data } = await api.get("/auth/keys");
      keys.value = data?.keys ?? [];
    } catch (err) {
      loadFailed.value = true;
      if (err?.response?.status !== 401) throw err;
    } finally {
      loading.value = false;
    }
  }

  /** POST and return `{ key, secret }`. The list is only updated by `addKey`. */
  async function createKey(name, scope) {
    const { data } = await api.post("/auth/keys", { name, scope });
    return data;
  }

  function addKey(key) {
    keys.value = [key, ...keys.value.filter(k => k.id !== key.id)];
  }

  async function revokeKey(id) {
    await api.delete(`/auth/keys/${id}`);
    keys.value = keys.value.filter(k => k.id !== id);
  }

  return { keys, loading, loadFailed, fetchKeys, createKey, addKey, revokeKey };
});
