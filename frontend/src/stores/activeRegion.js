import { defineStore } from "pinia";
import { ref } from "vue";
import { getLeafRegions } from "../utils/layout";

/**
 * Session-scoped active region per dashboard screen.
 *
 * `activeRegionId` in the persisted screen config is only a starting bookmark:
 * tapping or key-cycling a region changes what the focus light and touch
 * navigation target, not a setting. Keeping that in a local store means a tap
 * never POSTs the whole dashboardScreens config and re-renders every region.
 * The editor still persists the bookmark when the layout is deliberately saved.
 */
export const useActiveRegionStore = defineStore("activeRegion", () => {
  const byScreen = ref({});

  const leavesOf = screen => getLeafRegions(screen?.layout);

  const getActiveRegionId = screen => {
    if (!screen) return null;
    const sessionId = byScreen.value[screen.id];
    if (sessionId && leavesOf(screen).some(leaf => leaf.id === sessionId)) {
      return sessionId;
    }
    return screen.activeRegionId;
  };

  const setActiveRegionId = (screen, regionId) => {
    if (!screen || !leavesOf(screen).some(leaf => leaf.id === regionId)) return;
    byScreen.value = { ...byScreen.value, [screen.id]: regionId };
  };

  return { byScreen, getActiveRegionId, setActiveRegionId };
});
