import { computed, ref, watch } from "vue";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { getKioskId } from "@/utils/kioskId";
import {
  LAYOUT_STORAGE_KEY,
  applyLayoutMode as applyLayoutClass,
  resolveLayoutMode,
} from "@/utils/layoutMode";

/**
 * Applies this screen's layout choice to <html> (calvin-tnkg).
 *
 * The value comes from the same per-screen setting the Settings row edits:
 * a kiosk's override, or this browser's localStorage choice. Auto leaves the
 * layout classes off, so the viewport decides as it always has.
 *
 * Called once from App.vue's setup, so the class is on <html> before the first
 * paint (a kiosk picks its override up when its merged config arrives).
 */
export function useLayoutOverride() {
  const current = ref("auto");

  const applyLayoutMode = mode => {
    current.value = applyLayoutClass(mode);
    return current.value;
  };

  const syncWithConfig = () => {
    const kiosk = Boolean(getKioskId());
    // Per-key shared ref inside useScreenSetting keeps this watch in step with
    // a change made in Settings (localStorage for a browser, the kiosk's
    // override on the server).
    const { value } = useScreenSetting("layoutMode", { storageKey: LAYOUT_STORAGE_KEY });
    const effective = computed(() =>
      resolveLayoutMode({
        kiosk,
        screenValue: kiosk ? value.value : null,
        browserValue: kiosk ? null : value.value,
      })
    );
    watch(effective, mode => applyLayoutMode(mode), { immediate: true });
  };

  return { current, applyLayoutMode, syncWithConfig };
}
