import { computed } from "vue";
import { useRoute } from "vue-router";
import { useConfigStore } from "../stores/config";
import {
  getActiveDashboardScreen,
  getClockBarPlacementGap,
  getGlobalClockBarSettings,
  resolveClockBarForScreen,
} from "../utils/layout";

/**
 * Whether a clock bar is on screen right now (CLV-48).
 *
 * The connection pill lives in the clock bar; when that bar is hidden (controls
 * hidden and "Keep the clock bar when hidden" off, a between-bar with no gap, or
 * a page without one) a floating pill takes over. Mirrors the visibility rules
 * Dashboard.vue applies when it renders the bars.
 */
export function useClockBarVisible() {
  const configStore = useConfigStore();
  const route = useRoute();

  return computed(() => {
    if (!route || route.name !== "dashboard") return false;

    const barVisible = configStore.shouldShowUI || configStore.clockBarShowInKiosk;
    if (!barVisible) return false;

    const screen = getActiveDashboardScreen(configStore.effectiveDashboardScreens);
    const clockBar = resolveClockBarForScreen(
      screen,
      getGlobalClockBarSettings({
        clockBarMode: configStore.clockBarMode,
        clockBarPosition: configStore.clockBarPosition,
      })
    );
    if (!clockBar.enabled) return false;

    if (clockBar.position === "between") {
      const regions = screen?.layout?.regions?.length || 0;
      return getClockBarPlacementGap(clockBar.position, regions) !== null;
    }

    return true;
  });
}
