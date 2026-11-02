import { ref, watch } from "vue";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { DEFAULT_UI_SIZE, isUiSize, uiScaleFor } from "@/styles/uiScale";

// Applies the UI-size preset to the DOM by setting the --ui-scale custom
// property on <html>. Mirrors useTypeTheme (setProperty + localStorage boot
// cache), but the size itself is a PER-SCREEN setting (settings copy audit §2):
// this browser's own choice wins and the server value is only the seed for a
// screen that has never picked one.
//
// The localStorage cache (STORAGE_KEY) is both that per-screen value and the
// first-paint cache, so a phone and a 7" panel can hold opposite sizes.
//
// See docs/design/2026-07-04-ui-sizing-tokens.md for the token vocabulary.

const STORAGE_KEY = "calvin-ui-size";

export function useUiScale() {
  const current = ref(DEFAULT_UI_SIZE);

  const applyUiScale = id => {
    const key = isUiSize(id) ? id : DEFAULT_UI_SIZE;
    document.documentElement.style.setProperty("--ui-scale", String(uiScaleFor(key)));
    current.value = key;
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

  // Live sync: reconcile with this screen's value once the config store is
  // populated (server value seeds a screen with no choice of its own), and keep
  // applying on every subsequent change from the Settings control.
  const syncWithConfig = () => {
    const { value } = useScreenSetting("uiSize", { storageKey: STORAGE_KEY });
    watch(
      () => value.value,
      key => {
        if (key !== undefined && key !== null && key !== current.value) applyUiScale(key);
      },
      { immediate: true }
    );
  };

  return { current, applyUiScale, loadUiScale, syncWithConfig };
}
