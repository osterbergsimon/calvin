import { computed, ref, watch } from "vue";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { getKioskId } from "@/utils/kioskId";
import { applyLayoutMode as applyLayoutClass, resolveLayoutMode } from "@/utils/layoutMode";

/**
 * Applies this screen's layout choice to <html> (calvin-tnkg).
 *
 * The value comes from the same per-screen setting the Settings row edits: a
 * kiosk's override on top of the household config, or the household config in a
 * plain browser. Auto leaves the layout classes off, so the viewport decides as
 * it always has.
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
    // The descriptor says layoutMode has no browser layer: on a kiosk this is
    // the merged config, in a plain browser the household config. A stale
    // localStorage value from an older version is never read.
    const { value } = useScreenSetting("layoutMode");
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
