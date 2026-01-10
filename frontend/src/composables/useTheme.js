import { ref, watch, onMounted, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useThemesStore } from "../stores/themes";

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
      const matchMedia =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      shouldBeDark = matchMedia ? matchMedia.matches : false;
    } else if (themeMode.value === "time") {
      // Use time-based switching
      shouldBeDark = isDarkTime();
    }

    isDark.value = shouldBeDark;
    await applyTheme(shouldBeDark);
  };

  // Apply custom theme variables
  const applyCustomTheme = async (themeId) => {
    if (!themeId || typeof window === "undefined") return;

    try {
      const theme = await themesStore.getTheme(themeId);
      if (!theme || !theme.variables) return;

      const root = document.documentElement;
      const variables = theme.variables;

      // Apply light mode variables
      for (const [key, value] of Object.entries(variables)) {
        root.style.setProperty(`--${key}`, value);
      }

      // Apply dark mode variables if available
      if (theme.dark_mode && isDark.value) {
        for (const [key, value] of Object.entries(theme.dark_mode)) {
          root.style.setProperty(`--${key}`, value);
        }
      }
    } catch (err) {
      console.error(`Failed to apply custom theme ${themeId}:`, err);
    }
  };

  // Apply theme to document
  const applyTheme = async (dark) => {
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
      // Reset to default theme variables (from theme.css)
      // This is handled by the CSS file, but we can explicitly reset if needed
      const root = document.documentElement;
      // Remove any custom theme variables that might have been set
      // The default theme.css will take over
    }
  };

  // Set theme mode
  const setThemeMode = async (mode) => {
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
    systemThemeWatcher = () =>
      mediaQuery.removeEventListener("change", handleChange);
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
  const setSelectedTheme = async (themeId) => {
    selectedThemeId.value = themeId;
    themesStore.setSelectedTheme(themeId);
    await updateTheme();
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
      selectedThemeId.value = configStore.selectedTheme;
      themesStore.setSelectedTheme(configStore.selectedTheme);
    }
    if (configStore.darkModeStart !== undefined) {
      darkModeStart.value = configStore.darkModeStart;
    }
    if (configStore.darkModeEnd !== undefined) {
      darkModeEnd.value = configStore.darkModeEnd;
    }

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
  watch(themeMode, async (newMode) => {
    await updateTheme();
    if (newMode === "time") {
      startTimeCheck();
    } else {
      stopTimeCheck();
    }
    await saveTheme();
  });

  // Watch selected theme changes
  watch(selectedThemeId, async (newThemeId) => {
    if (newThemeId) {
      await applyCustomTheme(newThemeId);
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
    async (newMode) => {
      if (newMode !== undefined && newMode !== themeMode.value) {
        themeMode.value = newMode;
        await updateTheme();
      }
    },
  );

  watch(
    () => configStore.selectedTheme,
    async (newTheme) => {
      if (newTheme !== undefined && newTheme !== selectedThemeId.value) {
        selectedThemeId.value = newTheme;
        themesStore.setSelectedTheme(newTheme);
        await applyCustomTheme(newTheme);
      }
    },
  );

  watch(
    () => configStore.darkModeStart,
    async (newStart) => {
      if (newStart !== undefined && newStart !== darkModeStart.value) {
        darkModeStart.value = newStart;
        if (themeMode.value === "time") {
          await updateTheme();
        }
      }
    },
  );

  watch(
    () => configStore.darkModeEnd,
    async (newEnd) => {
      if (newEnd !== undefined && newEnd !== darkModeEnd.value) {
        darkModeEnd.value = newEnd;
        if (themeMode.value === "time") {
          await updateTheme();
        }
      }
    },
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
