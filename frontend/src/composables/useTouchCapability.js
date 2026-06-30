import { ref, computed, readonly, onScopeDispose } from "vue";
import { useConfigStore } from "../stores/config";

/**
 * Reactive touch-capability detection with a manual override.
 *
 * `isTouch` decides whether touch chrome (region controls, screen dots,
 * admin overflow, fullscreen close) renders. It combines a config override
 * with auto-detection:
 *   - config `touchControls: 'on'`   → always true  (force touch chrome)
 *   - config `touchControls: 'off'`  → always false (hide touch chrome)
 *   - config `touchControls: 'auto'` → `(any-pointer: coarse)` matches
 *
 * `any-pointer` (not `pointer`) is used so a touchscreen wired to a machine
 * that also has a mouse is still detected, while a keyboard-only unit with no
 * pointing device stays false. Auto-detection is unreliable on some hybrid
 * setups, hence the explicit 'on'/'off' override.
 */
export function useTouchCapability() {
  const configStore = useConfigStore();
  const coarse = ref(false);

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(any-pointer: coarse)");
    coarse.value = mql.matches;
    const update = event => {
      coarse.value = event.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      onScopeDispose(() => mql.removeEventListener("change", update));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(update); // older Safari
      onScopeDispose(() => mql.removeListener(update));
    }
  }

  const isTouch = computed(() => {
    const mode = configStore.touchControls;
    if (mode === "on") return true;
    if (mode === "off") return false;
    return coarse.value; // 'auto'
  });

  return { isTouch: readonly(isTouch) };
}
