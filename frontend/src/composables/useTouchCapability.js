import { ref, readonly, onScopeDispose } from "vue";

/**
 * Reactive touch-capability detection.
 * `isTouch` is true when ANY attached pointer is coarse (a touchscreen) —
 * `any-pointer` rather than `pointer` so a touch unit that also has a mouse
 * (e.g. a touchscreen wired to a workstation) is still detected, while the
 * 24" keyboard-only unit with no pointing device stays false. Single source
 * of truth for whether to render touch chrome.
 */
export function useTouchCapability() {
  const isTouch = ref(false);

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mql = window.matchMedia("(any-pointer: coarse)");
    isTouch.value = mql.matches;
    const update = event => {
      isTouch.value = event.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      onScopeDispose(() => mql.removeEventListener("change", update));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(update); // older Safari
      onScopeDispose(() => mql.removeListener(update));
    }
  }

  return { isTouch: readonly(isTouch) };
}
