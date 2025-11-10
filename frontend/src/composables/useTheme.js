import { ref, watch, onMounted, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";

/**
 * Composable for managing theme (dark mode).
 * Supports manual toggle, time-based, and system theme detection.
 */
export function useTheme() {
  const configStore = useConfigStore();

  // Theme modes: 'light', 'dark', 'auto' (system), 'time' (time-based)
  const themeMode = ref("auto"); // 'light' | 'dark' | 'auto' | 'time'
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
  const updateTheme = () => {
    if (typeof window === "undefined") return;

    let shouldBeDark = false;

    if (themeMode.value === "light") {
      shouldBeDark = false;
    } else if (themeMode.value === "dark") {
      shouldBeDark = true;
    } else if (themeMode.value === "auto") {
      // Use system preference
      shouldBeDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else if (themeMode.value === "time") {
      // Use time-based switching
      shouldBeDark = isDarkTime();
    }

    isDark.value = shouldBeDark;
    applyTheme(shouldBeDark);
  };

  // Apply theme to document
  const applyTheme = (dark) => {
    const html = document.documentElement;
    if (dark) {
      html.classList.add("dark");
      html.classList.remove("light");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
    }
  };

  // Set theme mode
  const setThemeMode = (mode) => {
    themeMode.value = mode;
    updateTheme();
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

  // Load theme from config
  const loadTheme = async () => {
    await configStore.fetchConfig();

    // Get theme settings from config store
    if (configStore.themeMode) {
      themeMode.value = configStore.themeMode;
    }
    if (configStore.darkModeStart !== undefined) {
      darkModeStart.value = configStore.darkModeStart;
    }
    if (configStore.darkModeEnd !== undefined) {
      darkModeEnd.value = configStore.darkModeEnd;
    }

    updateTheme();
    startTimeCheck();
  };

  // Save theme to config
  const saveTheme = async () => {
    await configStore.updateConfig({
      themeMode: themeMode.value,
      darkModeStart: darkModeStart.value,
      darkModeEnd: darkModeEnd.value,
    });
  };

  // Watch theme mode changes
  watch(themeMode, (newMode) => {
    updateTheme();
    if (newMode === "time") {
      startTimeCheck();
    } else {
      stopTimeCheck();
    }
    saveTheme();
  });

  // Watch dark mode time changes
  watch([darkModeStart, darkModeEnd], () => {
    if (themeMode.value === "time") {
      updateTheme();
    }
    saveTheme();
  });

  // Watch config store for theme changes (so changes from Settings page apply immediately)
  watch(() => configStore.themeMode, (newMode) => {
    if (newMode !== undefined && newMode !== themeMode.value) {
      themeMode.value = newMode;
      updateTheme();
    }
  });

  watch(() => configStore.darkModeStart, (newStart) => {
    if (newStart !== undefined && newStart !== darkModeStart.value) {
      darkModeStart.value = newStart;
      if (themeMode.value === "time") {
        updateTheme();
      }
    }
  });

  watch(() => configStore.darkModeEnd, (newEnd) => {
    if (newEnd !== undefined && newEnd !== darkModeEnd.value) {
      darkModeEnd.value = newEnd;
      if (themeMode.value === "time") {
        updateTheme();
      }
    }
  });

  // Initialize theme immediately and on mount
  if (typeof window !== "undefined") {
    // Initial theme update (before mount)
    updateTheme();
  }

  onMounted(() => {
    loadTheme();
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
    isDark,
    darkModeStart,
    darkModeEnd,
    setThemeMode,
    setDarkModeTime,
    updateTheme,
    loadTheme,
  };
}
