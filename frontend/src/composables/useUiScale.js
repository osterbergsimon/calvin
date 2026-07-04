import { ref, watch } from "vue";
import { useConfigStore } from "@/stores/config";
import { DEFAULT_UI_SIZE, isUiSize, uiScaleFor } from "@/styles/uiScale";

// Applies the global UI-size preset to the DOM by setting the --ui-scale
// custom property on <html>. Mirrors useTypeTheme (setProperty + localStorage
// boot cache) but is config-backed like useTheme: the config store is the
// source of truth, the localStorage cache only exists to apply the right size
// on first paint (before /api/config loads) so there is no size flash.
//
// See docs/design/2026-07-04-ui-sizing-tokens.md for the token vocabulary.

const STORAGE_KEY = "calvin-ui-size";

export function useUiScale() {
  const current = ref(DEFAULT_UI_SIZE);

  const applyUiScale = id => {
    const key = isUiSize(id) ? id : DEFAULT_UI_SIZE;
    document.documentElement.style.setProperty("--ui-scale", String(uiScaleFor(key)));
    current.value = key;
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* storage unavailable — non-fatal */
    }
  };

  // Boot: apply the cached preset synchronously before mount (no FOUC).
  const loadUiScale = () => {
    let key = DEFAULT_UI_SIZE;
    try {
      key = localStorage.getItem(STORAGE_KEY) || DEFAULT_UI_SIZE;
    } catch {
      /* storage unavailable */
    }
    applyUiScale(key);
  };

  // Live sync: reconcile with the config store once it's populated (API wins),
  // and keep applying on every subsequent change from the Settings control.
  const syncWithConfig = () => {
    const configStore = useConfigStore();
    watch(
      () => configStore.uiSize,
      key => {
        if (key !== undefined && key !== current.value) applyUiScale(key);
      },
      { immediate: true },
    );
  };

  return { current, applyUiScale, loadUiScale, syncWithConfig };
}
