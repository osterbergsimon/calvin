import { ref } from "vue";
import { TYPE_THEMES, DEFAULT_TYPE_THEME, isTypeTheme } from "@/styles/typeThemes";

const STORAGE_KEY = "calvin-type-theme";

export function useTypeTheme() {
  const current = ref(DEFAULT_TYPE_THEME);

  const applyTypeTheme = id => {
    const themeId = isTypeTheme(id) ? id : DEFAULT_TYPE_THEME;
    const { display, ui, data } = TYPE_THEMES[themeId];
    const root = document.documentElement;
    root.style.setProperty("--font-display", display);
    root.style.setProperty("--font-ui", ui);
    root.style.setProperty("--font-data", data);
    current.value = themeId;
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* storage unavailable — non-fatal */
    }
  };

  const loadTypeTheme = () => {
    let id = DEFAULT_TYPE_THEME;
    try {
      id = localStorage.getItem(STORAGE_KEY) || DEFAULT_TYPE_THEME;
    } catch {
      /* storage unavailable */
    }
    applyTypeTheme(id);
  };

  return { current, applyTypeTheme, loadTypeTheme };
}
