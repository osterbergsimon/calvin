import { defineStore } from "pinia";
import { ref } from "vue";
import * as shareApi from "@/services/shareApi";

/** Share links for guest photo upload (calvin-mwqo), as Settings › Content › Photos lists them. */
export const useShareLinksStore = defineStore("shareLinks", () => {
  const links = ref([]);
  const folders = ref([]);
  const loading = ref(false);
  const loadFailed = ref(false);

  async function fetchLinks() {
    loading.value = true;
    loadFailed.value = false;
    try {
      links.value = await shareApi.listLinks();
    } catch (err) {
      loadFailed.value = true;
      if (err?.response?.status !== 401) throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchFolders() {
    try {
      folders.value = await shareApi.listFolders();
    } catch {
      folders.value = [];
    }
  }

  async function createLink(input) {
    const link = await shareApi.createLink(input);
    links.value = [link, ...links.value.filter(l => l.id !== link.id)];
    if (!folders.value.includes(link.folder)) folders.value = [...folders.value, link.folder].sort();
    return link;
  }

  async function renameLink(id, name) {
    const link = await shareApi.renameLink(id, name);
    links.value = links.value.map(l => (l.id === id ? link : l));
    return link;
  }

  async function revokeLink(id, options) {
    await shareApi.revokeLink(id, options);
    links.value = links.value.filter(l => l.id !== id);
  }

  return {
    links,
    folders,
    loading,
    loadFailed,
    fetchLinks,
    fetchFolders,
    createLink,
    renameLink,
    revokeLink,
  };
});
