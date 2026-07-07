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
 * `hasPointer` additionally counts a fine (mouse) pointer, so mouse desktops
 * get clickable controls while keyboard-only kiosks do not.
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
  const fine = ref(false);

  // maxTouchPoints is a static device capability: a touchscreen reports > 0 even
  // when it doesn't surface a coarse pointer to the media query.
  const hasTouchPoints = () => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const coarseMql = window.matchMedia("(any-pointer: coarse)");
    coarse.value = coarseMql.matches || hasTouchPoints();
    const updateCoarse = event => {
      coarse.value = event.matches || hasTouchPoints();
    };
    const fineMql = window.matchMedia("(any-pointer: fine)");
    fine.value = fineMql.matches;
    const updateFine = event => {
      fine.value = event.matches;
    };
    if (typeof coarseMql.addEventListener === "function") {
      coarseMql.addEventListener("change", updateCoarse);
      fineMql.addEventListener("change", updateFine);
      onScopeDispose(() => {
        coarseMql.removeEventListener("change", updateCoarse);
        fineMql.removeEventListener("change", updateFine);
      });
    } else if (typeof coarseMql.addListener === "function") {
      coarseMql.addListener(updateCoarse); // older Safari
      fineMql.addListener(updateFine);
      onScopeDispose(() => {
        coarseMql.removeListener(updateCoarse);
        fineMql.removeListener(updateFine);
      });
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

  // hasPointer: a mouse OR touch is present. Drives clickable region controls —
  // a keyboard-only kiosk (no fine, no coarse) shows none. Same on/off override
  // as isTouch so an operator can force controls on or off.
  const hasPointer = computed(() => {
    const mode = configStore.touchControls;
    if (mode === "on") return true;
    if (mode === "off") return false;
    return fine.value || coarse.value; // 'auto'
  });

  return { isTouch: readonly(isTouch), hasPointer: readonly(hasPointer) };
}
