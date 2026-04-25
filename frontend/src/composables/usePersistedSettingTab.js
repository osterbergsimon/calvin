import { ref, watch } from "vue";

export function usePersistedSettingTab(storageKey, defaultTab) {
  const readInitialTab = () => {
    try {
      return sessionStorage.getItem(storageKey) || defaultTab;
    } catch {
      return defaultTab;
    }
  };

  const activeTab = ref(readInitialTab());

  watch(activeTab, tabId => {
    try {
      sessionStorage.setItem(storageKey, tabId);
    } catch {
      // Ignore storage failures; tab state still works for this render.
    }
  });

  const setActiveTab = tabId => {
    activeTab.value = tabId;
  };

  return {
    activeTab,
    setActiveTab,
  };
}
