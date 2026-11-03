import { computed } from "vue";
import { useScreenSetting } from "./useScreenSetting";

/** localStorage key for a non-kiosk browser's own choice. */
export const FOCUS_LIGHT_STYLE_STORAGE_KEY = "calvin-focus-light-style";

export const FOCUS_LIGHT_STYLES = ["performance", "full"];

/**
 * The focus light style for this screen (calvin-fufd): "performance" (no lift,
 * no animation; the default, cheap on a Pi 3B+) or "full" (the original neon
 * glow and dim, for fast kiosks). Per screen: a kiosk's override, or this
 * browser's own choice.
 */
export function useFocusLightStyle() {
  const setting = useScreenSetting("focusLightStyle", {
    storageKey: FOCUS_LIGHT_STYLE_STORAGE_KEY,
  });
  const style = computed(() =>
    FOCUS_LIGHT_STYLES.includes(setting.value.value) ? setting.value.value : "performance"
  );
  return { style, set: setting.set, reset: setting.reset, overridden: setting.overridden };
}
