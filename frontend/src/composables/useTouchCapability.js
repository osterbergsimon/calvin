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
 *   - config `touchControls: 'auto'` → `(any-pointer: coarse)` matches OR the
 *     device reports touch points (`navigator.maxTouchPoints > 0`)
 *
 * `any-pointer` (not `pointer`) is used so a touchscreen wired to a machine
 * that also has a mouse is still detected, while a keyboard-only unit with no
 * pointing device stays false. Some touchscreens (Raspberry Pi panels, hybrid
 * setups) don't match `(any-pointer: coarse)` — their driver reports as a mouse
 * — so `navigator.maxTouchPoints` is ORed in as a second signal. Auto-detection
 * is still imperfect, hence the explicit 'on'/'off' override.
 */
export function useTouchCapability() {
  const configStore = useConfigStore();
  const coarse = ref(false);

  // maxTouchPoints is a static device capability: a touchscreen reports > 0 even
  // when it doesn't surface a coarse pointer to the media query.
  const hasTouchPoints = () => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(any-pointer: coarse)");
    coarse.value = mql.matches || hasTouchPoints();
    const update = event => {
      coarse.value = event.matches || hasTouchPoints();
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      onScopeDispose(() => mql.removeEventListener("change", update));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(update); // older Safari
      onScopeDispose(() => mql.removeListener(update));
    }
  } else {
    coarse.value = hasTouchPoints();
  }

  const isTouch = computed(() => {
    const mode = configStore.touchControls;
    if (mode === "on") return true;
    if (mode === "off") return false;
    return coarse.value; // 'auto'
  });

  return { isTouch: readonly(isTouch) };
}
