import { computed, ref, watch } from "vue";
import { useConfigStore } from "@/stores/config";
import { getKioskId } from "@/utils/kioskId";
import { applyEffectsLevel as applyAttribute, resolveEffectsLevel } from "@/utils/effectsLevel";

/**
 * Applies this screen's effects level to <html> (calvin-uudb).
 *
 * The value comes from the screen's effective config: a kiosk's merged config
 * (household value plus its own override), or the household config in a plain
 * browser. Auto resolves here until a kiosk model report exists.
 *
 * Called once from App.vue's setup, so the attribute is on <html> before the
 * first paint; the watch keeps it in step when a config poll or another
 * browser changes the value.
 */
export function useEffectsLevel() {
  const configStore = useConfigStore();
  const kiosk = Boolean(getKioskId());
  const current = ref(null);

  const resolved = computed(() => resolveEffectsLevel({ level: configStore.effectsLevel, kiosk }));

  const apply = level => {
    current.value = applyAttribute(level);
    return current.value;
  };

  const syncWithConfig = () => {
    watch(resolved, level => apply(level), { immediate: true });
  };

  return { current, resolved, kiosk, apply, syncWithConfig };
}
