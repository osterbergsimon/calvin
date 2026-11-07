import { ref, watch } from "vue";
import { TYPE_THEMES, DEFAULT_TYPE_THEME, isTypeTheme } from "@/styles/typeThemes";
import { useConfigStore } from "@/stores/config";
import { logError } from "@/utils/logger";

// First-paint cache only. The household config is the source of truth (H4);
// this keeps the saved font on screen before /api/config has answered.
const STORAGE_KEY = "calvin-type-theme";

const readCache = () => {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return isTypeTheme(id) ? id : null;
  } catch {
    return null;
  }
};

const writeCache = id => {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable — non-fatal */
  }
};

export function useTypeTheme() {
  const current = ref(DEFAULT_TYPE_THEME);
  // A composable instance tries the one-time browser→household migration once;
  // a failed save must not retry on every poll.
  let migrationAttempted = false;

  const applyFont = (id, { cache = true } = {}) => {
    const themeId = isTypeTheme(id) ? id : DEFAULT_TYPE_THEME;
    const { display, ui, data } = TYPE_THEMES[themeId];
    const root = document.documentElement;
    root.style.setProperty("--font-display", display);
    root.style.setProperty("--font-ui", ui);
    root.style.setProperty("--font-data", data);
    current.value = themeId;
    // Only a real choice is worth caching; a first-paint default must not look
    // like an old browser value to the one-time migration below.
    if (cache) writeCache(themeId);
  };

  // Explicit user change: apply at once, then save the household value.
  const applyTypeTheme = async id => {
    const themeId = isTypeTheme(id) ? id : DEFAULT_TYPE_THEME;
    applyFont(themeId);
    try {
      await useConfigStore().updateConfig({ typeTheme: themeId });
    } catch (err) {
      logError("[useTypeTheme]", "Failed to save the household font:", err);
    }
  };

  // Boot: apply the cached value synchronously before mount (no flash). The
  // config watcher below replaces it with the household value when it arrives.
  const loadTypeTheme = () => {
    const cached = readCache();
    applyFont(cached ?? DEFAULT_TYPE_THEME, { cache: cached !== null });
  };

  // Live sync: the household config wins. When it has no font yet, migrate a
  // browser's old localStorage choice exactly once (only after the config has
  // loaded, and never from a stale offline copy).
  const syncWithConfig = () => {
    const configStore = useConfigStore();

    const sync = () => {
      const configured = isTypeTheme(configStore.typeTheme) ? configStore.typeTheme : null;

      if (configured) {
        if (configured !== current.value) applyFont(configured);
        else writeCache(configured);
        return;
      }

      if (!configStore.hydrated || configStore.stale || migrationAttempted) return;
      migrationAttempted = true;

      const cached = readCache();
      applyFont(cached ?? DEFAULT_TYPE_THEME, { cache: cached !== null });
      if (!cached) return;

      configStore.updateConfig({ typeTheme: cached }).catch(err => {
        logError("[useTypeTheme]", "Failed to migrate the browser font:", err);
      });
    };

    watch(
      [() => configStore.typeTheme, () => configStore.hydrated, () => configStore.stale],
      sync,
      { immediate: true }
    );
  };

  return { current, applyTypeTheme, loadTypeTheme, syncWithConfig };
}
