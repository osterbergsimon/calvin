import { ref, watch, onMounted, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useThemesStore } from "../stores/themes";

/**
 * Normalize a selected-theme id to `null` when there is no custom theme.
 * A config round-trip can stringify a Python `None` into the literal "None"
 * (or "null"), which is truthy and would trigger GET /api/plugins/None → 400.
 * @param {*} id
 * @returns {string|null}
 */
function normalizeThemeId(id) {
  if (id == null || id === "" || id === "None" || id === "null") return null;
  return id;
}

const THEME_VARIABLE_KEYS = [
  "shadow",
  "shadow-hover",
  "bg-0",
  "bg-1",
  "bg-2",
  "line",
  "line-soft",
  "ink",
  "ink-2",
  "ink-3",
  "focus",
  "focus-ink",
  "focus-text",
  "ok",
  "ok-ink",
  "ok-text",
  "warn",
  "warn-ink",
  "warn-text",
  "err",
  "err-ink",
  "err-text",
  ...Array.from({ length: 8 }, (_, i) => `event-${i + 1}`),
];

// The same value syntax the backend allowlist enforces. The backend rejects an
// unsafe value at install and flags it at load; this is the last line of
// defence, so a stale or hand-edited theme.json can never write a var()/url().
const THEME_COLOUR_VALUE = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\))$/i;

// D1: a theme is a palette family; light/dark is the mode. These two ids were
// themes in 0.1.0 and are migrated away on load, once.
const LEGACY_MODE_THEMES = { light: null, dark: "dark" };

const appliedCustomThemeKeys = new Set();

function clearCustomThemeVariables() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  for (const key of new Set([...THEME_VARIABLE_KEYS, ...appliedCustomThemeKeys])) {
    root.style.removeProperty(`--${key}`);
  }
  appliedCustomThemeKeys.clear();
}

/**
 * Composable for managing theme (dark mode and custom themes).
 * Supports manual toggle, time-based, system theme detection, and custom theme selection.
 */
export function useTheme() {
  const configStore = useConfigStore();
  const themesStore = useThemesStore();

  // Theme modes: 'light', 'dark', 'auto' (system), 'time' (time-based)
  const themeMode = ref("auto"); // 'light' | 'dark' | 'auto' | 'time'
  const selectedThemeId = ref(null); // Selected custom theme ID (null = use themeMode)
  const isDark = ref(false);
  const darkModeStart = ref(18); // 6 PM (18:00) - when to switch to dark mode
  const darkModeEnd = ref(6); // 6 AM (06:00) - when to switch to light mode
  let timeCheckInterval = null;
  let systemThemeWatcher = null;
  // Run the D1 migration at most once per app instance.
  let legacyThemeMigrated = false;

  // Check if current time is within dark mode hours
  const isDarkTime = () => {
    const now = new Date();
    const hour = now.getHours();

    // If start > end, it means dark mode spans midnight
    if (darkModeStart.value > darkModeEnd.value) {
      return hour >= darkModeStart.value || hour < darkModeEnd.value;
    } else {
      return hour >= darkModeStart.value && hour < darkModeEnd.value;
    }
  };

  // Update theme based on current mode
  const updateTheme = async () => {
    if (typeof window === "undefined") return;

    let shouldBeDark = false;

    if (themeMode.value === "light") {
      shouldBeDark = false;
    } else if (themeMode.value === "dark") {
      shouldBeDark = true;
    } else if (themeMode.value === "auto") {
      // Use system preference
      const matchMedia = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      shouldBeDark = matchMedia ? matchMedia.matches : false;
    } else if (themeMode.value === "time") {
      // Use time-based switching
      shouldBeDark = isDarkTime();
    }

    isDark.value = shouldBeDark;
    await applyTheme(shouldBeDark);
  };

  // Apply custom theme variables
  const applyCustomTheme = async themeId => {
    if (!normalizeThemeId(themeId) || typeof window === "undefined") return;

    try {
      const theme = await themesStore.getTheme(themeId);

      // Load-time contract verdict from the backend. A theme that fails is
      // kept installed but is not selectable: fall back to Calvin's palette.
      if (!theme || theme.selectable === false) {
        clearCustomThemeVariables();
        return;
      }

      const variables = { ...theme.variables, ...(isDark.value ? theme.dark_mode || {} : {}) };
      if (!variables || typeof variables !== "object") return;

      clearCustomThemeVariables();

      const root = document.documentElement;
      for (const [key, value] of Object.entries(variables)) {
        // Colours only, allowlisted keys only. Role, spacing, radius, z-index
        // and legacy names can never reach the page from a theme.
        if (!THEME_VARIABLE_KEYS.includes(key)) continue;
        if (typeof value !== "string" || !THEME_COLOUR_VALUE.test(value.trim())) continue;
        root.style.setProperty(`--${key}`, value.trim());
        appliedCustomThemeKeys.add(key);
      }
    } catch (err) {
      clearCustomThemeVariables();
      console.error(`Failed to apply custom theme ${themeId}:`, err);
    }
  };

  // Apply theme to document
  const applyTheme = async dark => {
    const html = document.documentElement;
    if (dark) {
      html.classList.add("dark");
      html.classList.remove("light");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
    }

    // Apply custom theme if one is selected, otherwise use default theme variables
    if (selectedThemeId.value) {
      await applyCustomTheme(selectedThemeId.value);
    } else {
      // No custom theme: clear inline custom variables so the .light/.dark
      // defaults in theme.css can take over again.
      clearCustomThemeVariables();
    }
  };

  // Set theme mode
  const setThemeMode = async mode => {
    themeMode.value = mode;
    await updateTheme();
  };

  // Set dark mode time range
  const setDarkModeTime = (start, end) => {
    darkModeStart.value = start;
    darkModeEnd.value = end;
    if (themeMode.value === "time") {
      updateTheme();
    }
  };

  // Watch for system theme changes (for 'auto' mode)
  const watchSystemTheme = () => {
    if (typeof window === "undefined") return null;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (themeMode.value === "auto") {
        updateTheme();
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    systemThemeWatcher = () => mediaQuery.removeEventListener("change", handleChange);
    return systemThemeWatcher;
  };

  // Start time-based checking
  const startTimeCheck = () => {
    if (timeCheckInterval) {
      clearInterval(timeCheckInterval);
    }

    if (themeMode.value === "time") {
      // Check every minute
      timeCheckInterval = setInterval(() => {
        updateTheme();
      }, 60000); // 60 seconds
    }
  };

  // Stop time-based checking
  const stopTimeCheck = () => {
    if (timeCheckInterval) {
      clearInterval(timeCheckInterval);
      timeCheckInterval = null;
    }
  };

  // Set selected theme
  const setSelectedTheme = async themeId => {
    selectedThemeId.value = themeId;
    themesStore.setSelectedTheme(themeId);
    await updateTheme();
    await saveTheme();
  };

  // D1 migration: a config saved by 0.1.0 may point at the retired Light or
  // Dark theme. Map it to Calvin default once; Dark also sets the mode so the
  // screen looks the same as before. Follow device / On a schedule keep working
  // because the theme no longer overrides the mode.
  const migrateLegacyTheme = async () => {
    if (legacyThemeMigrated) return;
    const legacy = normalizeThemeId(configStore.selectedTheme);
    if (!(legacy in LEGACY_MODE_THEMES)) return;

    legacyThemeMigrated = true;
    selectedThemeId.value = null;
    themesStore.setSelectedTheme(null);
    const mode = LEGACY_MODE_THEMES[legacy];
    if (mode) themeMode.value = mode;
    await saveTheme();
  };

  // Load theme from config
  const loadTheme = async () => {
    await configStore.fetchConfig();

    // Get theme settings from config store
    if (configStore.themeMode) {
      themeMode.value = configStore.themeMode;
    }
    if (configStore.selectedTheme !== undefined) {
      const normalized = normalizeThemeId(configStore.selectedTheme);
      selectedThemeId.value = normalized;
      themesStore.setSelectedTheme(normalized);
    }
    if (configStore.darkModeStart !== undefined) {
      darkModeStart.value = configStore.darkModeStart;
    }
    if (configStore.darkModeEnd !== undefined) {
      darkModeEnd.value = configStore.darkModeEnd;
    }

    await migrateLegacyTheme();
    await updateTheme();
    startTimeCheck();
  };

  // Save theme to config
  const saveTheme = async () => {
    await configStore.updateConfig({
      themeMode: themeMode.value,
      selectedTheme: selectedThemeId.value,
      darkModeStart: darkModeStart.value,
      darkModeEnd: darkModeEnd.value,
    });
  };

  // Watch theme mode changes
  watch(themeMode, async newMode => {
    await updateTheme();
    if (newMode === "time") {
      startTimeCheck();
    } else {
      stopTimeCheck();
    }
    await saveTheme();
  });

  // Watch selected theme changes
  watch(selectedThemeId, async newThemeId => {
    if (newThemeId) {
      await applyCustomTheme(newThemeId);
    } else {
      await applyTheme(isDark.value);
    }
    await saveTheme();
  });

  // Watch dark mode time changes
  watch([darkModeStart, darkModeEnd], async () => {
    if (themeMode.value === "time") {
      await updateTheme();
    }
    await saveTheme();
  });

  // Watch config store for theme changes (so changes from Settings page apply immediately)
  watch(
    () => configStore.themeMode,
    async newMode => {
      if (newMode !== undefined && newMode !== themeMode.value) {
        themeMode.value = newMode;
        await updateTheme();
      }
    }
  );

  watch(
    () => configStore.selectedTheme,
    async newTheme => {
      const normalized = normalizeThemeId(newTheme);
      if (newTheme !== undefined && normalized !== selectedThemeId.value) {
        selectedThemeId.value = normalized;
        themesStore.setSelectedTheme(normalized);
        await applyCustomTheme(normalized);
      }
    }
  );

  watch(
    () => configStore.darkModeStart,
    async newStart => {
      if (newStart !== undefined && newStart !== darkModeStart.value) {
        darkModeStart.value = newStart;
        if (themeMode.value === "time") {
          await updateTheme();
        }
      }
    }
  );

  watch(
    () => configStore.darkModeEnd,
    async newEnd => {
      if (newEnd !== undefined && newEnd !== darkModeEnd.value) {
        darkModeEnd.value = newEnd;
        if (themeMode.value === "time") {
          await updateTheme();
        }
      }
    }
  );

  // Initialize theme immediately and on mount
  if (typeof window !== "undefined") {
    // Initial theme update (before mount)
    updateTheme();
  }

  onMounted(async () => {
    await loadTheme();
    watchSystemTheme();
  });

  onUnmounted(() => {
    stopTimeCheck();
    if (systemThemeWatcher) {
      systemThemeWatcher();
    }
  });

  return {
    themeMode,
    selectedThemeId,
    isDark,
    darkModeStart,
    darkModeEnd,
    setThemeMode,
    setSelectedTheme,
    setDarkModeTime,
    updateTheme,
    loadTheme,
  };
}
