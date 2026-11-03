import { ref, watch, onMounted, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useThemesStore } from "../stores/themes";
import { kioskOverridesQueue } from "../utils/kioskOverridesQueue";

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

// Where an explicit change goes. The household value is the default; a
// per-screen Look row can pass { kioskId } so the same save writes that
// screen's overrides instead (settings-scope §7 item 5, rows come in item 6).
const HOUSEHOLD_THEME_TARGET = Object.freeze({ scope: "household" });

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

  // Set theme mode (an explicit user change, so this is what saves).
  const setThemeMode = async mode => {
    themeMode.value = mode;
    await updateTheme();
    await saveTheme({ themeMode: mode });
  };

  // Set dark mode time range (an explicit user change, so this is what saves).
  const setDarkModeTime = async (start, end) => {
    darkModeStart.value = start;
    darkModeEnd.value = end;
    if (themeMode.value === "time") {
      await updateTheme();
    }
    await saveTheme({ darkModeStart: start, darkModeEnd: end });
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

  // Set selected theme (an explicit user change, so this is what saves).
  const setSelectedTheme = async themeId => {
    selectedThemeId.value = themeId;
    themesStore.setSelectedTheme(themeId);
    await updateTheme();
    await saveTheme({ selectedTheme: themeId });
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

  // Save theme. `changes` is the explicit user change; `target` decides where
  // it lands: the household config by default, or a screen's kiosk overrides.
  const saveTheme = async (changes = {}, target = HOUSEHOLD_THEME_TARGET) => {
    const payload = {
      themeMode: themeMode.value,
      selectedTheme: selectedThemeId.value,
      darkModeStart: darkModeStart.value,
      darkModeEnd: darkModeEnd.value,
      ...changes,
    };

    if (target?.save) {
      await target.save(payload);
      return;
    }
    if (target?.kioskId) {
      await kioskOverridesQueue(target.kioskId).setPartial(payload);
      return;
    }
    await configStore.updateConfig(payload);
  };

  // Apply changes locally. Watching the refs (rather than saving in them) keeps
  // a config poll, a boot load or a legacy migration from writing the household
  // config: only the setters above and saveTheme() persist anything (H2).
  watch(themeMode, async newMode => {
    await updateTheme();
    if (newMode === "time") {
      startTimeCheck();
    } else {
      stopTimeCheck();
    }
  });

  watch(selectedThemeId, async newThemeId => {
    if (newThemeId) {
      await applyCustomTheme(newThemeId);
    } else {
      await applyTheme(isDark.value);
    }
  });

  watch([darkModeStart, darkModeEnd], async () => {
    if (themeMode.value === "time") {
      await updateTheme();
    }
  });

  // Watch the config store so a change from Settings or the next config poll
  // applies on this screen without a reload (H3). These only move the local
  // refs; the watches above apply them and persist nothing.
  watch(
    () => configStore.themeMode,
    newMode => {
      if (newMode !== undefined && newMode !== themeMode.value) {
        themeMode.value = newMode;
      }
    }
  );

  watch(
    () => configStore.selectedTheme,
    newTheme => {
      const normalized = normalizeThemeId(newTheme);
      if (newTheme !== undefined && normalized !== selectedThemeId.value) {
        selectedThemeId.value = normalized;
        themesStore.setSelectedTheme(normalized);
      }
    }
  );

  watch(
    () => configStore.darkModeStart,
    newStart => {
      if (newStart !== undefined && newStart !== darkModeStart.value) {
        darkModeStart.value = newStart;
      }
    }
  );

  watch(
    () => configStore.darkModeEnd,
    newEnd => {
      if (newEnd !== undefined && newEnd !== darkModeEnd.value) {
        darkModeEnd.value = newEnd;
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
    saveTheme,
  };
}
